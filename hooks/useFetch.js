import _filter from 'lodash/filter'
import _get from 'lodash/get'
import _includes from 'lodash/includes'
import _isUndefined from 'lodash/isUndefined'
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

const fetchData = (url, refresh) => {
  let pulse = timer(0, 1000).pipe(mapTo(url))

  if (!refresh) pulse = pulse.pipe(take(1))

  if (url in cache) return { fetcher: cache[url], pulse }

  const fetcher = pulse.pipe(
    switchMap((u) => getURL(u)),
    catchError((err) => {
      return of(err)
    }),
    publishBehavior(null),
    refCount(),
    filter((ev) => ev !== null),
  )

  cache[url] = fetcher

  return { fetcher, pulse }
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
    const { fetcher, pulse } = fetchData(url, refresh)

    const sub = fetcher.subscribe((ev) => {
      if (ev.ok === false) {
        setError(ev)
        setData([])
        return
      }
      setData(ev.body)
      setError([])
    })

    merge(fetcher, pulse)
      .pipe(
        map((val) => {
          if (!_isUndefined(val.status)) return false
          return true
        }),
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
    let updates = []

    const base = all.pipe(map((url) => fetchData(url, refresh)))
    const fetcher = base.pipe(map((obj) => obj.fetcher))

    const status = base.pipe(
      flatMap((obj) => obj.pulse),
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

    const vals = fetcher.pipe(
      mergeAll(),
      filter((item) => !isError(item)),
      updateBy('url'),
    )

    const errs = fetcher.pipe(
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
