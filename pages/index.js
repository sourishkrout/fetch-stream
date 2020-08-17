import useFetch from '~/hooks/useFetch'

const Home = () => {
  const result = useFetch('https://baconipsum.com/api/?type=meat-and-filler')
  return <pre>{JSON.stringify(result, null, 2)}</pre>
}

export default Home
