const express = require('express')
const cors = require('cors')
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb')
require('dotenv').config()
const jwt = require('jsonwebtoken')

const app = express()
app.use(cors())
app.use(express.json())

const port = process.env.PORT || 5000

const verifyJWT = (req, res, next) => {
  const { authorization } = req.headers
  if (!authorization) {
    return res.status(401).send({ message: 'UnAuthorized Access' })
  }

  const token = authorization.split(' ')[1]

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) return res.status(403).send({ message: 'Forbidden Access' })

    req.decoded = decoded
    next()
  })
}

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
    const userCollection = client.db('doctors_portal').collection('users')
    const doctorCollection = client.db('doctors_portal').collection('doctors')

    const verifyAdmin = async (req, res, next) => {
      const requestor = req.decoded.email
      const query = { email: requestor }
      const requestorAccount = await userCollection.findOne(query)

      if (requestorAccount.role !== 'admin') {
        return res.status(403).send({ message: 'Forbidden Request' })
      }

      next()
    }

    app.get('/user', verifyJWT, async (req, res) => {
      const query = {}
      const users = await userCollection.find(query).toArray()

      res.send(users)
    })

    app.get('/admin/:email', verifyJWT, async (req, res) => {
      const { email } = req.params
      const user = await userCollection.findOne({ email })
      const isAdmin = user.role === 'admin'

      res.send({ admin: isAdmin })
    })

    app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const { email } = req.params

      const filter = { email: email }
      const updateDoc = {
        $set: {
          role: 'admin',
        },
      }
      const result = await userCollection.updateOne(filter, updateDoc)
      res.send(result)
    })

    app.put('/user/:email', async (req, res) => {
      const { email } = req.params
      const user = req.body
      const filter = { email: email }
      const options = { upsert: true }
      const updateDoc = {
        $set: user,
      }
      const result = await userCollection.updateOne(filter, updateDoc, options)

      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: '1d',
      })

      res.send({ result, accessToken: token })
    })

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

    app.get('/booking', verifyJWT, async (req, res) => {
      const { date, email } = req.query
      const decoded = req.decoded
      if (email !== decoded.email)
        return res.status(403).send({ message: 'Forbidden Access' })
      const query = { date: date, 'patient.email': email }
      const result = await bookingCollection.find(query).toArray()

      res.send(result)
    })

    app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const result = await doctorCollection.find({}).toArray()
      res.send(result)
    })

    app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) => {
      const doctor = req.body
      const result = await doctorCollection.insertOne(doctor)

      res.send(result)
    })

    app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) => {
      const { email } = req.params
      const filter = { email: email }
      const result = await doctorCollection.deleteOne(filter)

      res.send(result)
    })
  } finally {
  }
}

run().catch(console.dir)

app.listen(port, () =>
  console.log('doctors portal server is running on, ', port)
)
