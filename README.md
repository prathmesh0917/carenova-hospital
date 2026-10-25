# CareNova Hospital Management System

ADBMS mini project (Group C, Topic 3): a hospital management website built on **MongoDB**.
Stack: Node.js + Express, official `mongodb` driver (no Mongoose), plain HTML/CSS/JavaScript, Chart.js.

## Run it in 5 minutes

1. Install **MongoDB Community Server** and **MongoDB Compass**, and make sure MongoDB is running on port 27017.
2. Install **Node.js 18 or newer**.
3. In this folder:

```bash
npm install
npm run setup      # creates collections, $jsonSchema validation and indexes
npm run seed       # inserts sample data (safe to run many times)
npm run dev        # open http://localhost:3000
```

Optional, for a clear Index Proof demo (adds 5000 dummy patients):

```bash
node setup/seed.js --big
```

The settings are in `.env` (`MONGO_URI`, `PORT`). The hospital name is one constant in `public/js/config.js`.

## Folder map

| Path | What it does |
|------|--------------|
| `server.js`, `db.js` | Express app and MongoDB connection |
| `setup/createCollections.js` | 4 collections with `$jsonSchema` validators |
| `setup/createIndexes.js` | All indexes from the spec |
| `setup/seed.js` | Sample data (6 departments, 12 doctors, 40 patients, 80 appointments) |
| `routes/*.js` | REST API (patients, doctors, appointments, departments, dashboard, reports) |
| `public/` | The website (5 pages, `css/style.css`, `js/*.js`) |

## Database design (carenova_db)

- **departments**: name (unique), floor
- **doctors**: `departmentId` is a reference to departments
- **patients**: address, allergies and medicalHistory are **embedded**
- **appointments**: `patientId` and `doctorId` are references; the prescription is **embedded**

## Screenshots

_Add screenshots here: Dashboard, Patients, Doctors, Appointments, Reports, Index Proof._

## Demo script (about 8 minutes)

1. Open Compass: show `carenova_db`, the 4 collections, one patient (nested address, allergies) and one appointment with a prescription.
2. Explain embedding vs referencing using those two documents.
3. Show the Validation and Indexes tabs in Compass.
4. Open the website, add a patient, refresh Compass and show the new document.
5. Book an appointment, then try the same doctor and slot again: double booking is blocked.
6. Complete the appointment with a prescription.
7. Open Reports, show a couple of charts and click **Show pipeline**.
8. Run **Index Proof** and compare `docsExamined` with and without the index.

## Viva notes

| Question | Short answer |
|----------|--------------|
| Why MongoDB and not SQL? | Patient data is nested and varied (allergies, history, prescriptions). Documents store it naturally with no joins for common reads, and the schema can grow easily. |
| Why not a JSON file? | A JSON file is loaded fully into memory, has no indexes, no safe concurrent writes and no aggregation. MongoDB gives all of these. |
| What is BSON? | Binary JSON, MongoDB's storage format. Faster, and supports extra types like Date and ObjectId. |
| Embedding vs referencing? | Embed data that belongs to one parent and is read together. Reference data that is shared by many documents. |
| How did you stop double booking? | A unique compound index on `doctorId + date + timeSlot` with a partial filter on `status: "Scheduled"`. A duplicate insert throws error 11000, and the API returns HTTP 409. Cancelled appointments do not block the slot. |
| What is an index and what does it cost? | A sorted structure that avoids scanning every document. It costs extra storage and makes writes slightly slower. |
| What is the aggregation pipeline? | Documents flow through stages like `$match`, `$group`, `$lookup`, `$sort`. Each stage transforms the result, like SQL GROUP BY plus JOIN. |
| What is replication? | Copies of the data on several servers (a replica set) with one primary, for availability and failover. |
| What is sharding? | Splitting a big collection across servers using a shard key, for horizontal scaling. |
| Does MongoDB support transactions? | Yes, multi-document ACID transactions on replica sets since version 4.0. Single-document writes are always atomic. |
| CAP theorem? | A distributed system can guarantee only two of Consistency, Availability and Partition tolerance. MongoDB by default favours consistency (CP). |

## API quick list

`GET/POST /api/patients`, `GET/PUT/DELETE /api/patients/:id`, `GET/POST /api/doctors`, `PUT/DELETE /api/doctors/:id`,
`GET/POST /api/appointments`, `GET /api/appointments/slots?doctorId=&date=`, `PUT/DELETE /api/appointments/:id`,
`GET /api/departments`, `GET /api/dashboard`, `GET /api/reports/:name`, `GET /api/reports/index-proof`.

Report names: `patients-per-doctor`, `per-day`, `top-diagnoses`, `status-split`, `per-department`, `age-groups`, `revenue`, plus the extra `registrations`.
