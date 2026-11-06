// The exchanges both Yahoo Finance and Google Finance cover. A portfolio belongs to one, and to its currency.
export type Market = { id: string; name: string; region: string; suffix: string; currency: string; locale: string; indexes: [string, string][] }
const m = (id: string, name: string, region: string, suffix: string, currency: string, locale: string, indexes: [string, string][] = []): Market =>
  ({ id, name, region, suffix, currency, locale, indexes })

export const EXCHANGES: Market[] = [
  m('NSE', 'NSE, India', 'Asia', '.NS', 'INR', 'en-IN', [['^NSEI', 'Nifty 50'], ['^BSESN', 'Sensex'], ['^NSEBANK', 'Bank Nifty']]),
  m('BSE', 'BSE, India', 'Asia', '.BO', 'INR', 'en-IN', [['^BSESN', 'Sensex'], ['^NSEI', 'Nifty 50']]),
  m('TSE', 'Tokyo, Japan', 'Asia', '.T', 'JPY', 'ja-JP', [['^N225', 'Nikkei 225']]),
  m('HKEX', 'Hong Kong', 'Asia', '.HK', 'HKD', 'en-HK', [['^HSI', 'Hang Seng']]),
  m('SSE', 'Shanghai, China', 'Asia', '.SS', 'CNY', 'zh-CN', [['000001.SS', 'Shanghai Composite']]),
  m('SZSE', 'Shenzhen, China', 'Asia', '.SZ', 'CNY', 'zh-CN', [['399001.SZ', 'Shenzhen Index']]),
  m('KRX', 'KOSPI, South Korea', 'Asia', '.KS', 'KRW', 'ko-KR', [['^KS11', 'KOSPI']]),
  m('KOSDAQ', 'KOSDAQ, South Korea', 'Asia', '.KQ', 'KRW', 'ko-KR', [['^KQ11', 'KOSDAQ']]),
  m('TWSE', 'Taiwan', 'Asia', '.TW', 'TWD', 'zh-TW', [['^TWII', 'Taiwan Weighted']]),
  m('SGX', 'Singapore', 'Asia', '.SI', 'SGD', 'en-SG', [['^STI', 'Straits Times']]),
  m('IDX', 'Jakarta, Indonesia', 'Asia', '.JK', 'IDR', 'id-ID', [['^JKSE', 'Jakarta Composite']]),
  m('SET', 'Bangkok, Thailand', 'Asia', '.BK', 'THB', 'th-TH', [['^SET.BK', 'SET Index']]),
  m('KLSE', 'Kuala Lumpur, Malaysia', 'Asia', '.KL', 'MYR', 'ms-MY', [['^KLSE', 'KLCI']]),
  m('SAU', 'Tadawul, Saudi Arabia', 'Asia', '.SR', 'SAR', 'en-SA'),
  m('TASE', 'Tel Aviv, Israel', 'Asia', '.TA', 'ILS', 'he-IL', [['^TA125.TA', 'TA-125']]),
  m('NASDAQ', 'NASDAQ, USA', 'Americas', '', 'USD', 'en-US', [['^IXIC', 'Nasdaq'], ['^GSPC', 'S&P 500'], ['^DJI', 'Dow Jones']]),
  m('NYSE', 'NYSE, USA', 'Americas', '', 'USD', 'en-US', [['^GSPC', 'S&P 500'], ['^DJI', 'Dow Jones'], ['^IXIC', 'Nasdaq']]),
  m('TSX', 'Toronto, Canada', 'Americas', '.TO', 'CAD', 'en-CA', [['^GSPTSE', 'S&P/TSX']]),
  m('TSXV', 'TSX Venture, Canada', 'Americas', '.V', 'CAD', 'en-CA'),
  m('BVMF', 'São Paulo, Brazil', 'Americas', '.SA', 'BRL', 'pt-BR', [['^BVSP', 'Bovespa']]),
  m('BMV', 'Mexico', 'Americas', '.MX', 'MXN', 'es-MX', [['^MXX', 'IPC Mexico']]),
  m('LSE', 'London, UK', 'Europe', '.L', 'GBP', 'en-GB', [['^FTSE', 'FTSE 100']]),
  m('XETRA', 'XETRA, Germany', 'Europe', '.DE', 'EUR', 'de-DE', [['^GDAXI', 'DAX']]),
  m('FRA', 'Frankfurt, Germany', 'Europe', '.F', 'EUR', 'de-DE', [['^GDAXI', 'DAX']]),
  m('EPA', 'Paris, France', 'Europe', '.PA', 'EUR', 'fr-FR', [['^FCHI', 'CAC 40']]),
  m('AMS', 'Amsterdam, Netherlands', 'Europe', '.AS', 'EUR', 'nl-NL', [['^AEX', 'AEX']]),
  m('EBR', 'Brussels, Belgium', 'Europe', '.BR', 'EUR', 'nl-BE', [['^BFX', 'BEL 20']]),
  m('ELI', 'Lisbon, Portugal', 'Europe', '.LS', 'EUR', 'pt-PT'),
  m('BIT', 'Milan, Italy', 'Europe', '.MI', 'EUR', 'it-IT', [['FTSEMIB.MI', 'FTSE MIB']]),
  m('BME', 'Madrid, Spain', 'Europe', '.MC', 'EUR', 'es-ES', [['^IBEX', 'IBEX 35']]),
  m('SIX', 'Zurich, Switzerland', 'Europe', '.SW', 'CHF', 'de-CH', [['^SSMI', 'SMI']]),
  m('STO', 'Stockholm, Sweden', 'Europe', '.ST', 'SEK', 'sv-SE', [['^OMX', 'OMX 30']]),
  m('OSL', 'Oslo, Norway', 'Europe', '.OL', 'NOK', 'nb-NO'),
  m('CPH', 'Copenhagen, Denmark', 'Europe', '.CO', 'DKK', 'da-DK'),
  m('HEL', 'Helsinki, Finland', 'Europe', '.HE', 'EUR', 'fi-FI'),
  m('VIE', 'Vienna, Austria', 'Europe', '.VI', 'EUR', 'de-AT', [['^ATX', 'ATX']]),
  m('WSE', 'Warsaw, Poland', 'Europe', '.WA', 'PLN', 'pl-PL'),
  m('IST', 'Istanbul, Turkey', 'Europe', '.IS', 'TRY', 'tr-TR', [['XU100.IS', 'BIST 100']]),
  m('ASX', 'Australia', 'Oceania & Africa', '.AX', 'AUD', 'en-AU', [['^AXJO', 'ASX 200']]),
  m('NZX', 'New Zealand', 'Oceania & Africa', '.NZ', 'NZD', 'en-NZ', [['^NZ50', 'NZX 50']]),
  m('JSE', 'Johannesburg, South Africa', 'Oceania & Africa', '.JO', 'ZAR', 'en-ZA', [['^J203.JO', 'JSE All Share']]),
]

export const exchange = (id: string) => EXCHANGES.find(x => x.id === id) ?? EXCHANGES[0]
export const short = (sym: string) => sym.replace(/\.[A-Z]+$/, '')
/** US tickers have no suffix, so NASDAQ and NYSE can't be told apart by symbol alone. */
export const matches = (id: string, sym: string) => {
  const { suffix } = exchange(id)
  return suffix ? sym.endsWith(suffix) : !sym.includes('.')
}
