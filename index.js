const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config()

const app = express()
app.use(cors())
app.use(express.json())

const port = process.env.PORT || 5000

app.get('/', (req, res) => {
  res.send('Doctors Portal Server is Running')
})

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.hbsug.mongodb.net/?retryWrites=true&w=majority`
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
})

const run = async () => {
  try {
    await client.connect()
    const appointmentsCollection = client
      .db('doctors_portal')
      .collection('appointments')

    app.get('/services', async (req, res) => {
      const query = {}
      const projection = { name: 1 }
      const cursor = appointmentsCollection.find(query).project(projection)
      const result = await cursor.toArray()

      res.send(result)
    })

    app.get('/appointment/:serviceName', async (req, res) => {
      const { serviceName } = req.params
      const query = { name: serviceName }
      const result = await appointmentsCollection.findOne(query)
      res.send(result)
    })
  } finally {
  }
}

run().catch(console.dir)

app.listen(port, () =>
  console.log('doctors portal server is running on, ', port)
)
