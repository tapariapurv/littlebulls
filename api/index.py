import html
import re
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote as urlquote

import requests
from fastapi import FastAPI, HTTPException, Response

app = FastAPI()
http = requests.Session()
http.headers["User-Agent"] = "Mozilla/5.0"
INDEXES = {"^NSEI", "^BSESN", "^NSEBANK"}
RANGES = {"1D": ("1d", "5m"), "5D": ("5d", "15m"), "1M": ("1mo", "1h"), "6M": ("6mo", "1d"),
          "1Y": ("1y", "1d"), "5Y": ("5y", "1wk"), "orders": ("5d", "5m")}
# yfinance drags in pandas and takes many seconds on a cold start, so prices and candles call the
# same Yahoo endpoint directly. yfinance is imported only by the slower research calls that need it.
LISTS = {"climbers": ("percentchange", False), "drops": ("percentchange", True), "busiest": ("dayvolume", False),
         "giants": ("intradaymarketcap", False), "payers": ("forward_dividend_yield", False)}


def check(sym: str) -> str:
    # Symbols end up in outbound URLs, so only NSE-shaped ones get through.
    if sym not in INDEXES and not re.fullmatch(r"[A-Z0-9&-]{1,20}\.NS", sym):
        raise HTTPException(400, "bad symbol")
    return sym


def chart(sym: str, rng: str, interval: str):
    r = http.get("https://query1.finance.yahoo.com/v8/finance/chart/" + urlquote(sym),
                 params={"range": rng, "interval": interval}, timeout=6)
    r.raise_for_status()
    return r.json()["chart"]["result"][0]


def quote(sym: str):
    c = chart(sym, "5d", "1d")
    m = c["meta"]
    # chartPreviousClose is unreliable, so read yesterday's close from the daily bars.
    days = [(t, x) for t, x in zip(c["timestamp"], c["indicators"]["quote"][0]["close"]) if x is not None]
    traded_today = days[-1][0] >= m["currentTradingPeriod"]["regular"]["start"]
    return {"symbol": sym, "price": m["regularMarketPrice"], "prev": days[-2 if traded_today else -1][1],
            "high": m.get("regularMarketDayHigh"), "low": m.get("regularMarketDayLow"),
            "period": m["currentTradingPeriod"]["regular"]}


@app.get("/api/quote")
def quotes(symbols: str, res: Response):
    syms = [check(s) for s in symbols.split(",")[:40]]
    res.headers["Cache-Control"] = "s-maxage=5, stale-while-revalidate=30"
    with ThreadPoolExecutor(8) as pool:
        found = list(pool.map(quote, syms))
    # Yahoo's trading period knows about NSE holidays, unlike a fixed clock check.
    period, now = found[0].pop("period"), time.time()
    for q in found:
        q.pop("period", None)
    return {"open": period["start"] <= now < period["end"], "quotes": found}


@app.get("/api/history")
def history(symbol: str, range: str, res: Response):
    if range not in RANGES:
        raise HTTPException(400, "bad range")
    c = chart(check(symbol), *RANGES[range])
    q = c["indicators"]["quote"][0]
    res.headers["Cache-Control"] = f"s-maxage={30 if range in ('1D', '5D', 'orders') else 3600}, stale-while-revalidate=86400"
    return [{"t": t, "o": o, "h": h, "l": l, "c": x}
            for t, o, h, l, x in zip(c.get("timestamp", []), q.get("open", []), q.get("high", []), q.get("low", []), q.get("close", []))
            if None not in (o, h, l, x)]


@app.get("/api/search")
def search(q: str, res: Response):
    import yfinance as yf
    res.headers["Cache-Control"] = "s-maxage=3600, stale-while-revalidate=86400"
    found = yf.Search(q[:50], max_results=12, news_count=0).quotes
    return [{"symbol": x["symbol"], "name": x.get("shortname") or x.get("longname") or x["symbol"]}
            for x in found if x.get("symbol", "").endswith(".NS")]


def about(name: str, ticker: str):
    """Words that must appear in a headline for it to really be about this company."""
    clean = re.sub(r"\b(Ltd|Limited|Corporation|Corp|India)\b\.?", "", name, flags=re.I).split()
    return " ".join(clean[:2]) or ticker, re.compile(rf"\b({re.escape(ticker)}|{re.escape(' '.join(clean[:2]) or ticker)})\b", re.I)


def stock_news(sym: str, name: str):
    key, wanted = about(name, sym[:-3])
    rss = http.get("https://news.google.com/rss/search", timeout=6, params={
        "q": f'("{key}" OR {sym[:-3]}) share when:30d', "hl": "en-IN", "gl": "IN", "ceid": "IN:en"}).text
    items, seen = [], set()
    for title, link, date in re.findall(r"<item><title>(.*?)</title><link>(.*?)</link>.*?<pubDate>(.*?)</pubDate>", rss, re.S):
        head, _, source = html.unescape(title).rpartition(" - ")
        # Live price pages aren't news. Headlines listing several companies aren't about this one.
        if (not wanted.search(head) or head in seen or head.count(",") >= 2
                or re.search(r"(share|stock) price\b.*\b(today|live|chart|prediction)|(share|stock) price\W*$", head, re.I)):
            continue
        seen.add(head)
        items.append({"title": head, "source": source, "url": html.unescape(link), "at": parsedate_to_datetime(date)})
    items.sort(key=lambda n: n["at"], reverse=True)
    return [{**n, "when": n["at"].astimezone(timezone.utc).strftime("%-d %b"), "at": None} for n in items[:6]]


@app.get("/api/stock")
def stock(symbol: str, res: Response):
    """Specs from Google Finance, and news searched by company name so it's about this stock only."""
    sym = check(symbol)
    page = http.get(f"https://www.google.com/finance/quote/{sym[:-3]}:NSE", timeout=6).text
    specs = dict(re.findall(r'class="SwQK7">([^<]+)</div><div class="dO6ijd">([^<]*)', page))
    title = re.search(r"<title>([^<(]+)\(", page)
    name = html.unescape(title.group(1)).strip() if title else sym[:-3]
    try:
        news = stock_news(sym, name)
    except (requests.RequestException, ValueError):
        news = []
    res.headers["Cache-Control"] = "s-maxage=600, stale-while-revalidate=86400"
    return {"name": name, "specs": specs, "news": news}


@app.get("/api/discover")
def discover(list: str, res: Response):
    if list not in LISTS:
        raise HTTPException(400, "bad list")
    from yfinance import EquityQuery as Q, screen
    field, asc = LISTS[list]
    # The market cap floor keeps out tiny stocks whose prices jump around on almost no trading.
    query = Q("and", [Q("eq", ["region", "in"]), Q("eq", ["exchange", "NSI"]), Q("gt", ["intradaymarketcap", 5e10])])
    res.headers["Cache-Control"] = "s-maxage=120, stale-while-revalidate=3600"
    return [{"symbol": x["symbol"], "name": x.get("longName") or x.get("shortName") or x["symbol"], "price": x.get("regularMarketPrice"),
             "pct": x.get("regularMarketChangePercent"), "yield": x.get("dividendYield"), "cap": x.get("marketCap")}
            for x in screen(query, sortField=field, sortAsc=asc, size=6)["quotes"]]
