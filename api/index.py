import html
import re
import threading
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.parse import quote as urlquote

import requests
from fastapi import FastAPI, HTTPException, Response
from fastapi.responses import JSONResponse
from requests.adapters import HTTPAdapter

app = FastAPI()
http = requests.Session()
http.headers["User-Agent"] = "Mozilla/5.0"
http.mount("https://", HTTPAdapter(pool_maxsize=64))  # reuses connections under load instead of new TLS handshakes
pool = ThreadPoolExecutor(32)  # shared, so one instance can't open unlimited calls to Yahoo
# id: (symbol suffix, Google Finance code, Yahoo exchange codes)
EXCHANGES = {
    "NSE": (".NS", "NSE", ("NSI",)), "BSE": (".BO", "BOM", ("BSE",)), "NASDAQ": ("", "NASDAQ", ("NMS", "NGM", "NCM")),
    "NYSE": ("", "NYSE", ("NYQ",)), "LSE": (".L", "LON", ("LSE",)), "TSX": (".TO", "TSE", ("TOR",)), "TSXV": (".V", "CVE", ("VAN",)),
    "ASX": (".AX", "ASX", ("ASX",)), "HKEX": (".HK", "HKG", ("HKG",)), "TSE": (".T", "TYO", ("JPX",)), "KRX": (".KS", "KRX", ("KSC",)),
    "KOSDAQ": (".KQ", "KOSDAQ", ("KOE",)), "SSE": (".SS", "SHA", ("SHH",)), "SZSE": (".SZ", "SHE", ("SHZ",)), "TWSE": (".TW", "TPE", ("TAI",)),
    "SGX": (".SI", "SGX", ("SES",)), "XETRA": (".DE", "ETR", ("GER",)), "FRA": (".F", "FRA", ("FRA",)), "EPA": (".PA", "EPA", ("PAR",)),
    "AMS": (".AS", "AMS", ("AMS",)), "EBR": (".BR", "EBR", ("BRU",)), "ELI": (".LS", "ELI", ("LIS",)), "BIT": (".MI", "BIT", ("MIL",)),
    "BME": (".MC", "BME", ("MCE",)), "SIX": (".SW", "SWX", ("EBS",)), "STO": (".ST", "STO", ("STO",)), "OSL": (".OL", "OSL", ("OSL",)),
    "CPH": (".CO", "CPH", ("CPH",)), "HEL": (".HE", "HEL", ("HEL",)), "VIE": (".VI", "VIE", ("VIE",)), "WSE": (".WA", "WSE", ("WSE",)),
    "IST": (".IS", "IST", ("IST",)), "BVMF": (".SA", "BVMF", ("SAO",)), "BMV": (".MX", "BMV", ("MEX",)), "JSE": (".JO", "JSE", ("JNB",)),
    "IDX": (".JK", "IDX", ("JKT",)), "SET": (".BK", "BKK", ("SET",)), "KLSE": (".KL", "KLSE", ("KLS",)), "NZX": (".NZ", "NZE", ("NZE",)),
    "SAU": (".SR", "TADAWUL", ("SAU",)), "TASE": (".TA", "TLV", ("TLV",)),
}
GOOGLE = {code: x[1] for x in EXCHANGES.values() for code in x[2]}
# Yahoo quotes these in hundredths (London in pence), so everything is scaled to the main currency.
SUBUNIT = {"GBp": 100, "GBX": 100, "ZAc": 100, "ZAC": 100, "ILA": 100}
# range: (candle size, candles merged into one, days fetched per page). Every tab opens on about the same number of bars.
RANGES = {"1D": ("5m", 1, 7), "5D": ("30m", 1, 30), "1M": ("1h", 2, 180), "6M": ("1d", 1, 730), "1Y": ("1d", 3, 1825),
          "5Y": ("1wk", 3, 7300), "orders": ("5m", 1, 5)}
LISTS = {"climbers": ("regularMarketChangePercent", True), "drops": ("regularMarketChangePercent", False),
         "busiest": ("regularMarketVolume", True), "giants": ("marketCap", True), "payers": ("dividendYield", True)}
# Yahoo refuses any request reaching further back than this for small candles.
OLDEST = {"5m": 59, "30m": 59, "1h": 729}
store: dict = {}
locks = [threading.Lock() for _ in range(64)]


@app.exception_handler(requests.RequestException)
def upstream_failed(_, e):
    gone = e.response is not None and e.response.status_code == 404
    return JSONResponse({"detail": "not found" if gone else "market data is unavailable"}, 404 if gone else 503, {"Cache-Control": "no-store"})


def shared(key: str, ttl: float, fn, stale: float = 0):
    """Any number of kids asking for one price makes one call to Yahoo. If Yahoo fails, the last good
    answer is served for `stale` seconds, and nobody retries for 5 seconds so a failure can't pile up."""
    def ready():
        got = store.get(key)  # (usable until, value or error, when it was fetched)
        return got if got and time.time() < got[0] else None

    hit = ready()
    if not hit:
        with locks[hash(key) % 64]:
            hit = ready()
            if not hit:
                old, now = store.get(key), time.time()
                try:
                    hit = (now + ttl, fn(), now)
                except requests.RequestException as e:
                    keep = old and not isinstance(old[1], Exception) and now - old[2] < stale
                    hit = (now + 5, old[1], old[2]) if keep else (now + 5, e, now)
                if len(store) > 20000:  # ponytail: drops everything at the cap; only a burst of junk symbols gets here
                    store.clear()
                store[key] = hit
    if isinstance(hit[1], Exception):
        raise hit[1]
    return hit[1]


def yahoo(path: str, **params):
    """Yahoo rate limits each host separately, so a refusal from one is retried on the other."""
    for host in ("query1", "query2"):
        try:
            r = http.get(f"https://{host}.finance.yahoo.com{path}", params=params, timeout=5)
        except (requests.Timeout, requests.ConnectionError):
            if host == "query2":
                raise
            continue
        if r.status_code != 429 and r.status_code < 500:
            break
    r.raise_for_status()
    return r


def check(sym: str) -> str:
    # Symbols end up in outbound URLs, so only symbol-shaped ones get through.
    if not re.fullmatch(r"\^?[A-Z0-9&=-]{1,20}(\.[A-Z]{1,3})?", sym):
        raise HTTPException(400, "bad symbol")
    return sym


def chart(sym: str, **params):
    try:
        return yahoo(f"/v8/finance/chart/{urlquote(sym)}", **params).json()["chart"]["result"][0]
    except (ValueError, KeyError, IndexError, TypeError) as e:
        raise requests.RequestException(f"unreadable answer for {sym}") from e


def fetch_quote(sym: str):
    c = chart(sym, range="5d", interval="1d")
    try:
        m = c["meta"]
        k = SUBUNIT.get(m.get("currency"), 1)
        # chartPreviousClose is unreliable, so read yesterday's close from the daily bars.
        days = [(t, x) for t, x in zip(c["timestamp"], c["indicators"]["quote"][0]["close"]) if x is not None]
        period = m["currentTradingPeriod"]["regular"]
        return {"symbol": sym, "name": m.get("longName") or m.get("shortName") or sym, "price": m["regularMarketPrice"] / k,
                "prev": days[-2 if days[-1][0] >= period["start"] else -1][1] / k, "start": period["start"], "end": period["end"]}
    except (KeyError, IndexError, TypeError) as e:
        raise requests.RequestException(f"no price for {sym}") from e


def quote(sym: str):
    try:
        return shared("quote:" + sym, 8, lambda: fetch_quote(sym), stale=600)
    except requests.RequestException:
        return None  # one delisted stock in a watchlist must not break the rest


@app.get("/api/quote")
def quotes(symbols: str, res: Response):
    syms = [check(s) for s in symbols.split(",")[:40]]
    res.headers["Cache-Control"] = "s-maxage=5, stale-while-revalidate=30"
    found = [q for q in pool.map(quote, syms) if q]
    if not found:
        raise HTTPException(503, "market data is unavailable")
    # Yahoo's trading period knows about holidays, unlike a fixed clock check.
    now = time.time()
    rows = [{"symbol": q["symbol"], "name": q["name"], "price": q["price"], "prev": q["prev"], "open": q["start"] <= now < q["end"]} for q in found]
    return {"open": any(r["open"] for r in rows), "quotes": rows}


def fix_wicks(o, h, l, c):
    """Yahoo's smaller candles sometimes have one absurd spike. It would draw a huge wick and could fill a waiting order."""
    return (min(o, c) if l < min(o, c) * 0.75 else l), (max(o, c) if h > max(o, c) * 1.33 else h)


def merge(bars, k):
    out = []
    for i in range(len(bars) % k or k, len(bars) + 1, k):  # counted from the newest, so the newest bar is always whole
        part = bars[max(0, i - k):i]
        out.append({"t": part[0]["t"], "o": part[0]["o"], "h": max(b["h"] for b in part), "l": min(b["l"] for b in part), "c": part[-1]["c"]})
    return out


@app.get("/api/history")
def history(symbol: str, range: str, res: Response, before: int | None = None):
    if range not in RANGES:
        raise HTTPException(400, "bad range")
    interval, k, days = RANGES[range]
    now = int(time.time())
    end = before or now
    start = max(end - days * 86400, now - OLDEST.get(interval, 36500) * 86400)
    if start >= end:
        return {"tz": 0, "bars": []}
    try:
        c = chart(check(symbol), interval=interval, period1=start, period2=end)
    except requests.HTTPError:
        if before:  # Yahoo keeps limited small-candle history; this means there is no more to scroll to
            return {"tz": 0, "bars": []}
        raise
    q = c["indicators"]["quote"][0]
    s = SUBUNIT.get(c["meta"].get("currency"), 1)
    res.headers["Cache-Control"] = f"s-maxage={3600 if before or interval in ('1d', '1wk') else 30}, stale-while-revalidate=86400"
    bars = []
    for t, o, h, l, x in zip(c.get("timestamp", []), q.get("open", []), q.get("high", []), q.get("low", []), q.get("close", [])):
        if None not in (o, h, l, x) and o > 0 and x > 0:
            l, h = fix_wicks(o, h, l, x)
            bars.append({"t": t, "o": o / s, "h": h / s, "l": l / s, "c": x / s})
    return {"tz": c["meta"].get("gmtoffset", 0), "bars": merge(bars, k) if bars else []}


@app.get("/api/search")
def search(q: str, ex: str, res: Response):
    if ex not in EXCHANGES:
        raise HTTPException(400, "bad exchange")
    suffix, _, codes = EXCHANGES[ex]
    res.headers["Cache-Control"] = "s-maxage=3600, stale-while-revalidate=86400"
    text = q.strip()[:50]
    ticker = text.upper() + suffix
    # Yahoo ranks across the whole world, so also try the typed word as a ticker on this exchange.
    words = pool.submit(yahoo, "/v1/finance/search", q=text, quotesCount=40, newsCount=0, enableFuzzyQuery="true")
    exact = pool.submit(quote, ticker) if re.fullmatch(r"[A-Z0-9&-]{1,12}", text.upper()) else None
    rows = [{"symbol": x["symbol"], "name": x.get("shortname") or x.get("longname") or x["symbol"]}
            for x in words.result().json().get("quotes", [])
            if x.get("exchange") in codes and x.get("quoteType") in ("EQUITY", "ETF")]
    hit = exact.result() if exact else None
    if hit and not suffix and not any(r["symbol"] == ticker for r in rows):
        hit = None  # a bare US ticker could be on the other US exchange
    if hit and all(r["symbol"] != ticker for r in rows):
        rows.insert(0, {"symbol": ticker, "name": hit["name"]})
    return rows


def about(name: str, ticker: str):
    """Words that must appear in a headline for it to really be about this company."""
    clean = re.sub(r"\b(Ltd|Limited|Corporation|Corp|Inc|PLC|AG|SA|SE|NV|Co|India)\b\.?,?", "", name, flags=re.I).split()
    key = " ".join(clean[:2]) or ticker
    return key, re.compile(rf"\b({re.escape(ticker)}|{re.escape(key)})\b", re.I)


def stock_news(sym: str, name: str):
    ticker = sym.split(".")[0]
    key, wanted = about(name, ticker)
    place = {"hl": "en-IN", "gl": "IN", "ceid": "IN:en"} if sym.endswith((".NS", ".BO")) else {"hl": "en-US", "gl": "US", "ceid": "US:en"}
    rss = http.get("https://news.google.com/rss/search", timeout=6, params={"q": f'("{key}" OR {ticker}) stock when:30d', **place}).text
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
    m = chart(sym, range="1d", interval="1d")["meta"]
    name = m.get("longName") or m.get("shortName") or sym
    code = GOOGLE.get(m.get("exchangeName"), "NSE")

    def news():
        try:
            return stock_news(sym, name)
        except (requests.RequestException, ValueError):
            return []

    def facts(market: str):
        try:
            page = http.get(f"https://www.google.com/finance/quote/{urlquote(sym.split('.')[0])}:{market}", timeout=6).text
        except requests.RequestException:
            return {}
        return dict(re.findall(r'class="SwQK7">([^<]+)</div><div class="dO6ijd">([^<]*)', page))

    found = pool.submit(news)  # the two lookups don't depend on each other, so neither waits
    specs = facts(code)
    if not specs and code == "BOM":  # Google lists BSE stocks by number, but the same company is on NSE by name
        specs = facts("NSE")
    for k, v in specs.items():  # Google shows these in hundredths too, like the prices scaled above
        hit = re.fullmatch(r"(GBX|ZAC|ILA)\s*([\d,.]+)", v)
        if hit:
            specs[k] = f"{ {'GBX': '£', 'ZAC': 'R', 'ILA': '₪'}[hit[1]] }{float(hit[2].replace(',', '')) / 100:,.2f}"
    # A page with nothing on it may just be Google having a moment, so it isn't remembered for long.
    res.headers["Cache-Control"] = f"s-maxage={600 if specs else 60}, stale-while-revalidate=86400"
    return {"name": name, "specs": specs, "news": found.result()}


crumb = ""


def screener(codes):
    """Yahoo's screener needs a session crumb; yfinance only ever did this for us, at the cost of pandas on every cold start."""
    global crumb
    body = {"size": 150, "offset": 0, "sortField": "intradaymarketcap", "sortType": "DESC", "quoteType": "EQUITY", "userId": "", "userIdType": "guid",
            "query": {"operator": "or", "operands": [{"operator": "eq", "operands": ["exchange", c]} for c in codes]}}
    for _ in range(2):
        if not crumb:
            http.get("https://fc.yahoo.com", timeout=6)
            crumb = yahoo("/v1/test/getcrumb").text
        r = http.post("https://query1.finance.yahoo.com/v1/finance/screener", params={"crumb": crumb}, json=body, timeout=8)
        if r.status_code not in (401, 403):
            break
        crumb = ""
    r.raise_for_status()
    return r.json()["finance"]["result"][0]["quotes"]


@app.get("/api/discover")
def discover(list: str, ex: str, res: Response, n: int = 8):
    if list not in LISTS or ex not in EXCHANGES:
        raise HTTPException(400, "bad list")
    suffix = EXCHANGES[ex][0]
    # Ranked within the exchange's biggest companies, which keeps out tiny stocks jumping on almost no trading,
    # and works in every currency, unlike a fixed market cap floor. Other-currency listings are dropped.
    codes = EXCHANGES[ex][2]
    rows = shared("screen:" + ex, 120, lambda: screener(codes), stale=3600)  # all five lists come from this one call
    main = next(iter(Counter(x.get("currency") for x in rows).most_common(1)), (None,))[0]
    rows = [x for x in rows if x.get("currency") == main and x.get("marketCap") and x["symbol"].endswith(suffix)]
    field, desc = LISTS[list]
    rows = sorted((x for x in rows if x.get(field) is not None), key=lambda x: x[field], reverse=desc)
    res.headers["Cache-Control"] = "s-maxage=300, stale-while-revalidate=3600"
    out = []
    for x in rows[:max(1, min(n, 30))]:
        k = SUBUNIT.get(x.get("currency"), 1)
        out.append({"symbol": x["symbol"], "name": x.get("longName") or x.get("shortName") or x["symbol"],
                    "price": x["regularMarketPrice"] / k if x.get("regularMarketPrice") else None,
                    "pct": x.get("regularMarketChangePercent"), "yield": x.get("dividendYield"), "cap": x.get("marketCap")})
    return out
