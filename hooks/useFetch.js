import _filter from 'lodash/filter'
import _get from 'lodash/get'
import _includes from 'lodash/includes'
import _map from 'lodash/map'
import _merge from 'lodash/merge'
import _omit from 'lodash/omit'
import _pick from 'lodash/pick'
import _unionBy from 'lodash/unionBy'
import _values from 'lodash/values'
import { useEffect, useMemo, useState } from 'react'
import {
  BehaviorSubject,
  combineLatest,
  empty,
  from,
  interval,
  merge,
  of,
  pipe,
  Subject,
  timer,
  zip,
} from 'rxjs'
import { fromFetch } from 'rxjs/fetch'
import {
  catchError,
  delayWhen,
  dematerialize,
  filter,
  flatMap,
  map,
  mapTo,
  materialize,
  mergeAll,
  onErrorResumeNext,
  pairwise,
  pluck,
  publishBehavior,
  reduce,
  refCount,
  scan,
  share,
  shareReplay,
  switchMap,
  take,
  tap,
  withLatestFrom,
} from 'rxjs/operators'

class FetchError extends Error {
  constructor(response, body, ...params) {
    super(...params)

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, FetchError)
    }

    this.name = 'FetchError'
    _merge(this, response)
    try {
      this.json = JSON.parse(body)
    } catch (err) {
      this.text = body
    }
  }
}

// const isComplete = (n) => n.kind === 'C'
// const isError = (n) => n.kind === 'E'

const getURL = (url) => {
  return fromFetch(url, {
    selector: async (resp) => _merge(resp, { text: await resp.text() }),
  }).pipe(
    flatMap((resp) => {
      if (!resp.ok) {
        throw new FetchError(resp, resp.text, `Unable to fetch: ${resp.url}`)
      }

      return of({ url: url, body: JSON.parse(resp.text), status: resp.status })
    }),
  )
}

const cache = {}

const fetchData = (url) => {
  if (url in cache) return cache[url]

  const refresher = timer(0, 1000).pipe(
    switchMap(() => getURL(url)),
    catchError((err) => {
      return of(err)
    }),
    publishBehavior(null),
    refCount(),
    filter((ev) => ev !== null),
  )

  cache[url] = refresher

  return cache[url]
}

// TODO: should refresh be configurable?
// TODO: work with a list of URLs and partial results
// TODO: get streaming results to work eg. watch=true
// TODO: handle revalidation and focus like SWR
const useFetch = (url, refresh = false) => {
  const [data, setData] = useState(undefined)
  const [error, setError] = useState(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetcher = fetchData(url)

    let refresher = fetcher
    if (!refresh) {
      refresher = fetcher.pipe(take(1))
    }

    const sub = refresher.subscribe((ev) => {
      if (ev.ok === false) {
        setError(ev)
        setData([])
        return
      }
      setData(ev.body)
      setError([])
    })

    of(setLoading(true))
      .pipe(
        delayWhen(() => refresher),
        mapTo(false),
      )
      .subscribe(setLoading)

    return () => sub.unsubscribe()
  }, [refresh, url])

  return { loading, error, data }
}

const isError = (item) => item.ok === false

const updateBy = (key) =>
  pipe(scan((result, item) => _unionBy([item], result, key), []))

const useFetchMany = (urls, refresh = false) => {
  const [data, setData] = useState([])
  const [error, setError] = useState([])
  const [loading, setLoading] = useState({})

  const key = JSON.stringify(urls)

  useEffect(() => {
    setData(_filter(data, (i) => _includes(urls, i)))
  }, [key])

  useEffect(() => {
    const all = from(urls).pipe(share())
    let updates = {}

    let base = all.pipe(map((url) => fetchData(url).pipe(take(1))))
    if (refresh) {
      base = all.pipe(map((url) => fetchData(url)))
    }

    const status = all.pipe(
      map((url) => {
        return {
          url,
          status: true,
        }
      }),
      updateBy('url'),
    )

    status.subscribe((status) => {
      updates = status
      setLoading(status)
    })

    const vals = base.pipe(
      mergeAll(),
      filter((item) => !isError(item)),
      updateBy('url'),
    )

    const errs = base.pipe(
      mergeAll(),
      filter((item) => isError(item)),
      updateBy('url'),
    )

    const stasub = merge(vals, errs)
      .pipe(
        delayWhen(() => status),
        flatMap((vals) => {
          return of(...vals)
        }),
        map((item) => {
          return {
            url: item.url,
            status: false,
          }
        }),
        flatMap((upd) => {
          return of(...updates.concat([upd]))
        }),
        updateBy('url'),
      )
      .subscribe((update) => {
        updates = update
        setLoading(updates)
      })

    const valsub = vals.subscribe(setData)
    const errsub = errs.subscribe(setError)

    return () => {
      valsub.unsubscribe()
      errsub.unsubscribe()
      stasub.unsubscribe()
    }
  }, [key])

  return { loading, error, data }
}

export { useFetchMany }
export default useFetch
