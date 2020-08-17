import _times from 'lodash/times'

import useFetch, { useFetchMany } from '~/hooks/useFetch'

const url = 'https://baconipsum.com/api/?type=meat-and-filler'
const numUrls = 5

const One = () => {
  const result = useFetch(url)
  return <pre>{JSON.stringify(result, null, 2)}</pre>
}

const Many = () => {
  const result = useFetchMany(_times(numUrls, (i) => `${url}&t=${i}`))

  return <pre>{JSON.stringify(result, null, 2)}</pre>
}

const Home = () => (
  <>
    <One />
    <Many />
  </>
)

export default Home
