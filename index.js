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

    const bookingCollection = client.db('doctors_portal').collection('bookings')

    // services endpoint to get all the Services Name
    app.get('/services', async (req, res) => {
      const query = {}
      const projection = { name: 1 }
      const cursor = appointmentsCollection.find(query).project(projection)
      const result = await cursor.toArray()

      res.send(result)
    })

    //add a new booking
    app.post('/booking', async (req, res) => {
      const booking = req.body
      // Checking if same treatment is booked in another time on same day by the same person
      const query = {
        treatment: booking.treatment,
        date: booking.date,
        'patient.email': booking.patient.email,
      }
      const exists = await bookingCollection.findOne(query)
      if (exists) return res.send({ success: false, booking: exists })

      // Checking if another treatment is booked by the same patient in same timeSlot in same day.
      const newQuery = {
        date: booking.date,
        slot: booking.slot,
        'patient.email': booking.patient.email,
      }
      const another = await bookingCollection.findOne(newQuery)

      if (another) return res.send({ success: false, booking: another })

      const result = await bookingCollection.insertOne(booking)
      res.send(result)
    })

    //! this is not the proper way to query
    //! use aggregate lookup, pipeline, match, group
    app.get('/available', async (req, res) => {
      const date = req.query.date

      //step 1: get all services

      const services = await appointmentsCollection.find({}).toArray()

      // step 2: get the booking of that day
      const query = { date: date }
      const bookings = await bookingCollection.find(query).toArray()

      // for each service find bookings for that service
      services.forEach((service) => {
        const serviceBookings = bookings.filter(
          (b) => b.treatment === service.name
        )
        const booked = serviceBookings.map((b) => b.slot)
        const available = service?.slots.filter((s) => !booked.includes(s.time))
        service.available = available
      })

      res.send(services)
    })

    //! this is not the proper way to query
    //! use aggregate lookup, pipeline, match, group
    app.get('/appointment/:serviceName', async (req, res) => {
      const { serviceName } = req.params
      const date = req.query.date
      const query = { name: serviceName }
      const service = await appointmentsCollection.findOne(query)

      const bookingsQuery = { date: date }
      const bookings = await bookingCollection.find(bookingsQuery).toArray()

      const serviceBookings = bookings.filter(
        (b) => b.treatment === service.name
      )
      const booked = serviceBookings.map((b) => b.slot)
      const available = service?.slots.filter((s) => !booked.includes(s.time))
      service.available = available
      res.send(service)
    })

    app.get('/booking', async (req, res) => {
      const { date, email } = req.query
      const query = { date: date, 'patient.email': email }
      const result = await bookingCollection.find(query).toArray()

      res.send(result)
    })
  } finally {
  }
}

run().catch(console.dir)

app.listen(port, () =>
  console.log('doctors portal server is running on, ', port)
)
