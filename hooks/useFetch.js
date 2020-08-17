import _merge from 'lodash/merge'
import { useEffect, useState } from 'react'
import { BehaviorSubject, combineLatest, interval, of } from 'rxjs'
import { fromFetch } from 'rxjs/fetch'
import {
  filter,
  map,
  materialize,
  pluck,
  shareReplay,
  switchMap,
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

const getURL = (url) =>
  fromFetch(url, {
    selector: async (resp) => _merge(resp, { text: await resp.text() }),
  }).pipe(
    map((resp) => {
      if (!resp.ok) {
        throw new FetchError(resp, resp.text, `Unable to fetch: ${resp.url}`)
      }

      return JSON.parse(resp.text)
    }),
    materialize(),
    filter((i) => !isComplete(i)),
  )

const cache = {}

const fetchData = (url) => {
  if (url in cache) return cache[url]

  const loading = new BehaviorSubject(false)

  const data = new BehaviorSubject(url).pipe(
    tap(() => loading.next(true)),
    switchMap(getURL),
    tap(() => loading.next(false)),
    shareReplay(1),
  )

  const refresh = combineLatest(of(url), interval(1000)).pipe(
    pluck(0),
    tap(data),
  )

  cache[url] = { data, loading, refresh }

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
    const { loading, data, refresh: startRefresh } = fetchData(url)
    const sub = loading.subscribe(setLoading).add(
      data.subscribe((ev) => {
        setData(ev.value)
        setError(ev.error)
      }),
    )

    if (refresh) {
      sub.add(startRefresh.subscribe())
    }

    return () => sub.unsubscribe()
  }, [refresh, url])

  return { loading, error, data }
}

export default useFetch
