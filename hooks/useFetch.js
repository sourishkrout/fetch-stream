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
  dematerialize,
  filter,
  map,
  materialize,
  mergeAll,
  mergeMap,
  onErrorResumeNext,
  pairwise,
  pluck,
  publish,
  refCount,
  scan,
  shareReplay,
  switchMap,
  take,
  tap,
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

const isComplete = (n) => n.kind === 'C'
const isError = (n) => n.kind === 'E'

const getURL = (url) => {
  return fromFetch(url, {
    selector: async (resp) => _merge(resp, { text: await resp.text() }),
  }).pipe(
    map((resp) => {
      if (!resp.ok) {
        throw new FetchError(resp, resp.text, `Unable to fetch: ${resp.url}`)
      }

      return { url: url, body: JSON.parse(resp.text), status: resp.status }
    }),
    materialize(),
    filter((i) => !isComplete(i)),
  )
}

const cache = {}

const fetchData = (url) => {
  if (url in cache) return cache[url]

  const refresher = timer(0, 1000).pipe(
    switchMap(() => getURL(url)),
    publish(),
    refCount(),
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
    const fetcher = fetchData(url).pipe(
      tap((ev) => {
        // maybe check for no errors? shrug
        if (ev.hasValue) {
          setLoading(false)
        }
      }),
    )

    let refresher = fetcher
    if (!refresh) {
      refresher = fetcher.pipe(take(1))
    }

    const sub = refresher.subscribe((ev) => {
      if (ev.error) {
        return setError(ev.error)
      }
      setData(ev.value.body)
    })

    return () => sub.unsubscribe()
  }, [refresh, url])

  return { loading, error, data }
}

const updateBy = (key) =>
  pipe(scan((result, item) => _unionBy([item], result, key), []))

const useFetchMany = (urls) => {
  const [data, setData] = useState([])
  const [error, setError] = useState([])
  const [loading, setLoading] = useState(true)

  const key = JSON.stringify(urls)

  useEffect(() => {
    setData(_filter(data, (i) => _includes(urls, i)))
  }, [key])

  useEffect(() => {
    const base = from(urls).pipe(
      mergeMap((url) => from(Object.entries(fetchData(url)))),
    )

    const errors = new Subject().pipe(
      filter(isError),
      pluck('error'),
      updateBy('url'),
    )

    const sub = from(base)
      .pipe(
        filter(([stream]) => stream === 'data'),
        pluck(1),
        mergeAll(),
        tap(errors),
        // This is dumb and AFAICT the most elegant way to silently drop
        // errors.
        filter((i) => !isError(i)),
        dematerialize(),
        updateBy('url'),
      )
      .subscribe(setData)
      .add(errors.subscribe(setError))

    return () => sub.unsubscribe()
  }, [key])

  return { loading, error, data }
}

export { useFetchMany }
export default useFetch
