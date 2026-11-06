import html
import re
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import requests
import yfinance as yf
from fastapi import FastAPI, HTTPException, Response

app = FastAPI()
IST = timezone(timedelta(hours=5, minutes=30))
RANGES = {"1D": ("1d", "5m"), "5D": ("5d", "15m"), "1M": ("1mo", "1h"), "6M": ("6mo", "1d"),
          "1Y": ("1y", "1d"), "5Y": ("5y", "1wk"), "orders": ("5d", "5m")}


def check(sym: str) -> str:
    # Symbols end up in outbound URLs, so only NSE-shaped ones get through.
    if not re.fullmatch(r"[A-Z0-9&-]{1,20}\.NS", sym):
        raise HTTPException(400, "bad symbol")
    return sym


def market_open() -> bool:
    # ponytail: ignores NSE holidays, add a holiday list if kids trade on one.
    now = datetime.now(IST)
    return now.weekday() < 5 and (9, 15) <= (now.hour, now.minute) < (15, 30)


def quote(sym: str):
    f = yf.Ticker(sym).fast_info
    return {"symbol": sym, "price": f["lastPrice"], "prev": f["previousClose"],
            "high": f["dayHigh"], "low": f["dayLow"]}


@app.get("/api/quote")
def quotes(symbols: str, res: Response):
    syms = [check(s) for s in symbols.split(",")[:40]]
    res.headers["Cache-Control"] = "s-maxage=10"
    with ThreadPoolExecutor(8) as pool:
        return {"open": market_open(), "quotes": list(pool.map(quote, syms))}


@app.get("/api/history")
def history(symbol: str, range: str, res: Response):
    if range not in RANGES:
        raise HTTPException(400, "bad range")
    period, interval = RANGES[range]
    df = yf.Ticker(check(symbol)).history(period=period, interval=interval).dropna()
    res.headers["Cache-Control"] = "s-maxage=30"
    return [{"t": int(i.timestamp()), "o": r.Open, "h": r.High, "l": r.Low, "c": r.Close} for i, r in df.iterrows()]


@app.get("/api/search")
def search(q: str, res: Response):
    res.headers["Cache-Control"] = "s-maxage=3600"
    found = yf.Search(q[:50], max_results=12, news_count=0).quotes
    return [{"symbol": x["symbol"], "name": x.get("shortname") or x.get("longname") or x["symbol"]}
            for x in found if x.get("symbol", "").endswith(".NS")]


@app.get("/api/stock")
def stock(symbol: str, res: Response):
    """Specs and news scraped from Google Finance, with yfinance news if its markup changes."""
    sym = check(symbol)
    page = requests.get(f"https://www.google.com/finance/quote/{sym[:-3]}:NSE",
                        headers={"User-Agent": "Mozilla/5.0"}, timeout=8).text
    specs = dict(re.findall(r'class="SwQK7">([^<]+)</div><div class="dO6ijd">([^<]*)', page))
    news = [{"source": html.unescape(s), "when": w, "url": html.unescape(u), "title": html.unescape(t)}
            for s, w, u, t in re.findall(
                r'class="WrUjhf">([^<]+)</div>.{0,80}?class="JQ8Czd">([^<]+)</div></div><a href="([^"]+)"[^>]*><div class="TQWIEd">([^<]+)',
                page)]
    if not news:
        for n in yf.Ticker(sym).news[:6]:
            c = n["content"]
            news.append({"source": (c.get("provider") or {}).get("displayName", ""), "when": c.get("pubDate", "")[:10],
                         "url": (c.get("canonicalUrl") or {}).get("url", ""), "title": c.get("title", "")})
    title = re.search(r"<title>([^<(]+)\(", page)
    res.headers["Cache-Control"] = "s-maxage=600"
    return {"name": html.unescape(title.group(1)).strip() if title else sym[:-3], "specs": specs, "news": news[:6]}
