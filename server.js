import { neru } from 'neru-alpha';

import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import logger from 'morgan';
import { v4 as uuidv4 } from 'uuid';

import path from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import http from 'http';
import { Server } from 'socket.io';
const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.NERU_APP_PORT;
const APP_ID = process.env.API_APPLICATION_ID;
const PROJECT_API_KEY = process.env.PROJECT_API_KEY;
const PROJECT_API_SECRET = process.env.PROJECT_API_SECRET;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRY = process.env.JWT_EXPIRY;
const EC_LIST_LIMIT = 100;
const EC_MAX_DURATION = 600;
const ARCHIVE_LIST_LIMIT = 50;

const instanceState = neru.getGlobalState();

app.use(logger('dev'));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));
server.listen(PORT);

// ------------------------------------------------------------------------

import axios from 'axios';
import atob from 'atob';
import jwt from 'jsonwebtoken';
import Util from 'util';
import OpenTok from 'opentok';
const opentok = new OpenTok(PROJECT_API_KEY, PROJECT_API_SECRET);

const APP_BASE_URL = `https://${process.env.INSTANCE_SERVICE_NAME}.${process.env.REGION.split(".")[1]}.serverless.vonage.com`;

app.get('/_/health', async (req, res) => {
  res.sendStatus(200);
});

app.get('/up', async (req, res, next) => {
  res.send('hello world').status(200);
});

app.get('/', (req, res, next) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/recorder-page', (req, res, next) => {
  res.sendFile(path.join(__dirname, 'recorder.html'));
});

app.post('/notify', async (req, res, next) => {
  try {
    console.log('/notify ', req.body);
    let { roomId, eventName, data } = req.body;
    
    if (!roomId || !eventName) {
      throw(new Error("roomId and eventName needed!"));
    }
    
    io.to(`room_${roomId}`).emit(eventName, data);
    
    res.sendStatus(200);
  } catch (error) {
    await errorHandler(res, error);
  }
});

app.post('/init', async (req, res, next) => {
  try {
    let { name, roomName } = req.body;

    if (!name && !roomName) {
      throw({ code: 401, message: "name and roomName needed!" });
    }

    let room = await findRoom({ roomName, createIfNotFound: true });
    console.log("room", room);
    if (!room.sessionId) {
      const generateSessionFunction = Util.promisify(generateSession);
      let sessionId = await generateSessionFunction();
      room = await saveSessionId(roomName, sessionId);
    }

    let token = await generateToken(room.sessionId);
    console.log(`Token created`);

    res.json({
      apiKey: PROJECT_API_KEY,
      sessionId: room.sessionId,
      roomId: room.id,
      roomName,
      roomArchiveInfo: room.archiveInfo,
      roomLayoutInfo: room.layoutInfo,
      token
    });

  } catch (error) {
    await errorHandler(res, error);
  }
});

app.post('/init/recorder-page', async (req, res, next) => {
  try {
    let { roomId } = req.body;

    if (!roomId) {
      throw({ code: 401, message: "roomId is needed!" });
    }

    let room = await findRoom({ roomId });
    console.log("room", room);
    if (!room) {
      throw("Invalid roomId");
    }

    let token = await generateToken(room.sessionId);//, "subscriber");
    console.log(`Subscriber Token created`);

    res.json({
      apiKey: PROJECT_API_KEY,
      sessionId: room.sessionId,
      roomId: room.id,
      roomName: room.name,
      roomArchiveInfo: room.archiveInfo,
      roomLayoutInfo: room.layoutInfo,
      token
    });

  } catch (error) {
    await errorHandler(res, error);
  }
});

app.post('/start-ec', async (req, res, next) => {
  try {
    let { roomName } = req.body;
    // console.log("/start-ec", JSON.stringify(req.body));

    if (!roomName) {
      throw("roomName can't be empty!");
    }

    // Find room
    let room = await findRoom({ roomName, createIfNotFound: false });
    let roomId = room.id;
    console.log(`room found:`, JSON.stringify(room));

    // Init Experience Composer
    const generateSessionFunction = Util.promisify(generateSession);
    let ecSessionId = await generateSessionFunction();
    console.log(`EC session created`, ecSessionId);
    
    let token = await generateToken(ecSessionId);
    console.log(`Token created`);
    
    let experienceComposer = await initExperienceComposer(ecSessionId, token, `${APP_BASE_URL}/recorder-page`, roomId);
    console.log(`Experience Composer created`);
    let archiveInfo = {
      ecId: experienceComposer.id,
      ecSessionId,
      archiveId: null,
      status: "pending"
    };
    await saveArchiveInfo(roomName, archiveInfo);
    console.log(`Archive info saved`);

    io.to(`room_${roomId}`).emit("event", {
      type: "archiveUpdate",
      archiveInfo, experienceComposer
    });
    io.to(`room_${roomId}`).emit("notification", {
      message: "An user has started recording this session."
    });
    
    res.json({
      experienceComposer, roomName, archiveInfo
    });

  } catch (error) {
    await errorHandler(res, error);
  }
});

app.post('/stop-ec', async (req, res, next) => {
  try {
    let { ecId, sessionId } = req.body;
    // console.log("/stop-ec", JSON.stringify(req.body));

    if (!ecId) {
      throw("Experience composer id is missing!");
    }

    let room = await findRoom({ sessionId, createIfNotFound: false });
    console.log("room", room);
    if (!room) {
      throw("Invalid sessionId");
    }
    if (!room.archiveInfo || !room.archiveInfo.archiveId || !room.archiveInfo.ecId) {
      throw("Archive not started");
    }
    if (room.archiveInfo.ecId !== ecId) {
      throw("Invalid experience composer id");
    }

    let result = {};

    result.stopArchiving = await stopArchiving(room.archiveInfo.archiveId);
    console.log(`Archive stopped`);

    result.deleteExperienceComposer = await deleteExperienceComposer(room.archiveInfo.ecId);
    console.log(`Experience Composer deleted`);

    await saveEcSessionId(room.name, room.archiveInfo.ecSessionId);
    await saveArchiveInfo(room.name, null);

    io.to(`room_${room.id}`).emit("event", {
      type: "archiveUpdate",
      archiveInfo: null, experienceComposer: null
    });
    io.to(`room_${room.id}`).emit("notification", {
      message: "Recording has been stopped."
    });

    res.json({
      result
    });

  } catch (error) {
    await errorHandler(res, error);
  }
});

app.post('/events/ec', async (req, res, next) => {
  try {
    console.log(new Date(), " | /events/ec", JSON.stringify(req.body));

    let { id, streamId, sessionId: ecSessionId, status } = req.body;

    if (status === "started") {
      let room = await findRoom({ ecSessionId, createIfNotFound: false });
      console.log("room", room);
      if (!room) {
        throw("Invalid sessionId");
      }
      let roomName = room.name;

      let archive = await startArchiving(ecSessionId);
      console.log(`Starting Archive`);

      await saveArchiveInfo(roomName, {
        ecId: id,
        ecSessionId,
        archiveId: archive.id,
        status: "starting"
      });

      let updatedArchive = await updateArchive(archive.id, streamId);
      console.log(`Updated Archive`);

      await saveArchiveInfo(roomName, {
        ecId: id,
        ecSessionId,
        archiveId: archive.id,
        status: "ongoing"
      });
    }

    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(200);
  }
});

app.post('/events/archive', (req, res, next) => {
  console.log(new Date(), " | /events/archive", JSON.stringify(req.body));
  res.sendStatus(200);
});

app.post('/update/layout', async (req, res, next) => {
  try {
    console.log(new Date(), " | /update/layout", JSON.stringify(req.body));

    let { roomName, layoutInfo } = req.body;
    if (!roomName) {
      throw("roomName and layoutInfo are required");
    }
    
    let room = await saveLayoutInfo(roomName, layoutInfo);

    io.to(`room_${room.id}`).emit("event", {
      type: "layoutUpdate",
      layoutInfo: room.layoutInfo
    });
    // io.to(`room_${room.id}`).emit("notification", {
    //   message: "Recording has been stopped."
    // });

    res.json({
      roomId: room.id,
      roomName: room.name,
      roomLayoutInfo: room.layoutInfo
    }).status(200);
  } catch (error) {
    await errorHandler(res, error);
  }
});

app.post('/list/archive', async (req, res, next) => {
  try {
    console.log(new Date(), " | /list/archive", JSON.stringify(req.body));

    let { sessionId } = req.body;
    
    let room = await findRoom({ sessionId, createIfNotFound: false });
    console.log("room", room);
    if (!room) {
      throw("Invalid sessionId");
    }
    let ecSessionIds = room.ecSessionIds;
    console.log("ecSessionIds", ecSessionIds);

    let result = { count: 0, items: [] };
    for(let i = 0; i < ecSessionIds.length; i++) {
      let archives = await listArchives(ecSessionIds[i]);
      console.log("archives", archives);
      result.count += archives.count;
      result.items = result.items.concat(archives.items);
    }

    res.json(result).status(200);
  } catch (error) {
    await errorHandler(res, error);
  }
});

// ------------------------------------------------------------------------

app.get('/admin/rooms', async (req, res, next) => {
  const key = `${APP_ID}:rooms`;
  let rooms = await instanceState.get(key);
  res.json({rooms}).status(200);
});

app.get('/admin/roomscleanup', async (req, res, next) => {
  const key = `${APP_ID}:rooms`;
  let rooms = await instanceState.set(key, []);
  res.json({rooms}).status(200);
});
app.get('/admin/eccleanup', async (req, res, next) => {
  // Check for existing Experience Composer and delete them
  let existingExperienceComposers = await listExperienceComposers();
  for (let i = 0; i < existingExperienceComposers.length; i++) {
    if (existingExperienceComposers[i].status !== "stopped" && existingExperienceComposers[i].status !== "failed") {
      await deleteExperienceComposer(existingExperienceComposers[i].id);
    }
  }
  res.json({status: "Ok", existingExperienceComposers}).status(200);
});
app.get('/admin/archivestop', async (req, res, next) => {
  let archives = await listArchives();
  archives = archives.items;
  for (let i = 0; i < archives.length; i++) {
    if (archives[i].status === "started" || archives[i].status === "paused") {
      await stopArchiving(archives[i].id);
    }
  }
  archives = await listArchives();
  res.json({status: "Ok", archives}).status(200);
});

// ------------------------------------------------------------------------

async function errorHandler(res, error) {
  console.error(error);
  if (typeof(error) === "string") {
    error = { message: error };
  }
  if (!error.code) {
    error.code = 500;
  }
  res.status(error.code).send(error.message);
}

async function generateJwt() {
  const payload = {
    "iss": PROJECT_API_KEY,
    "ist": "project",
    "iat": parseInt(new Date().getTime() / 1000),
    "jti": JWT_SECRET
  }
  const options = {
    expiresIn: JWT_EXPIRY,
    algorithm: 'HS256'
  }

  return jwt.sign(payload, PROJECT_API_SECRET, options);
}

// async function parseJwt(token) {
//   var base64Url = token.split('.')[1];
//   var base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
//   var jsonPayload = decodeURIComponent(atob(base64).split('').map(function(c) {
//       return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
//   }).join(''));

//   return JSON.parse(jsonPayload);
// };

async function findRoom({ roomName, roomId, sessionId, ecSessionId, createIfNotFound }) {
  if (!createIfNotFound) createIfNotFound = false;

  const key = `${APP_ID}:rooms`;
  let rooms = await instanceState.get(key);
  let room = null;
  console.log("key", key);
  console.log("rooms", rooms);

  if (!rooms) {
    rooms = [];
  }

  for(let i = 0; i < rooms.length; i++) {
    if (
      (roomName && rooms[i].name === roomName) ||
      (ecSessionId && rooms[i].archiveInfo && rooms[i].archiveInfo.ecSessionId === ecSessionId) ||
      (sessionId && rooms[i].sessionId === sessionId) ||
      (roomId && rooms[i].id === roomId)
    ) {
      room = rooms[i];
    }
  }

  if (!room && createIfNotFound) {
    const ts = new Date();
    room = {
      id: uuidv4(),
      name: roomName,
      sessionId: "",
      createdAt: ts.toISOString(),
      layoutInfo: {
        layoutType: 1,
        videosLayout: []
      },
      ecSessionIds: []
    };
    rooms.push(room);
    await instanceState.set(key, rooms);
    console.log("Room created and saved");
  }

  return room;
}

function generateSession(callback) {
  opentok.createSession({ mediaMode: "routed" }, (err, session) => {
    if (err) {
      console.error(err);
      return callback(err);
    }

    console.log(`Session created`);
    callback(null, session.sessionId);
  });
}

async function saveSessionId(roomName, sessionId) {
  const key = `${APP_ID}:rooms`;
  let rooms = await instanceState.get(key);
  let room = null;

  for(let i = 0; i < rooms.length; i++) {
    if (rooms[i].name === roomName) {
      rooms[i].sessionId = sessionId;
      room = rooms[i];
      await instanceState.set(key, rooms);
    }
  }

  if (!room) {
    throw("Invalid room name");
  }

  return room;
}

async function saveArchiveInfo(roomName, archiveInfo) {
  const key = `${APP_ID}:rooms`;
  let rooms = await instanceState.get(key);
  let room = null;

  for(let i = 0; i < rooms.length; i++) {
    if (rooms[i].name === roomName) {
      if (archiveInfo) {
        rooms[i].archiveInfo = archiveInfo;
      } else {
        delete rooms[i].archiveInfo;
      }
      room = rooms[i];
      await instanceState.set(key, rooms);
    }
  }

  if (!room) {
    throw("Invalid room name");
  }

  return room;
}

async function saveEcSessionId(roomName, ecSessionId) {
  const key = `${APP_ID}:rooms`;
  let rooms = await instanceState.get(key);
  let room = null;

  for(let i = 0; i < rooms.length; i++) {
    if (rooms[i].name === roomName) {
      rooms[i].ecSessionIds.push(ecSessionId);
      room = rooms[i];
      await instanceState.set(key, rooms);
    }
  }

  if (!room) {
    throw("Invalid room name");
  }

  return room;
}

async function saveLayoutInfo(roomName, layoutInfo) {
  const key = `${APP_ID}:rooms`;
  let rooms = await instanceState.get(key);
  let room = null;

  for(let i = 0; i < rooms.length; i++) {
    if (rooms[i].name === roomName) {
      rooms[i].layoutInfo = layoutInfo;
      room = rooms[i];
      await instanceState.set(key, rooms);
    }
  }

  if (!room) {
    throw("Invalid room name");
  }

  return room;
}

async function generateToken(sessionId, role) {
  if (role) {
    return opentok.generateToken(sessionId, { role });
  } else {
    return opentok.generateToken(sessionId);
  }
}

async function initExperienceComposer(sessionId, token, url, roomId) {
  let jwt = await generateJwt();

  var data = JSON.stringify({
    sessionId,
    token,
    url: `${url}?roomId=${roomId}`,
    properties: { name: "ecomposer" },
    projectId: PROJECT_API_KEY,
    maxDuration: EC_MAX_DURATION
  });
  
  var config = {
    method: 'post',
    url: `https://api.opentok.com/v2/project/${PROJECT_API_KEY}/render`,
    headers: { 
      'X-OPENTOK-AUTH': jwt, 
      'Content-Type': 'application/json'
    },
    data
  };
  // console.log("EC config ", JSON.stringify(config));

  let response = await axios(config);
  console.log("Init EC result ", JSON.stringify(response.data));
  return response.data;
}

async function listExperienceComposers() {
  let jwt = await generateJwt();
  let experienceComposers = await listExperienceComposer({ jwt, ecs: [], offset: 0 });
  return experienceComposers;
}

async function listExperienceComposer({ jwt, ecs, offset }) {
  // console.log("listExperienceComposer ecs / offset ", JSON.stringify(ecs), offset);

  var config = {
    method: 'get',
    url: `https://api.opentok.com/v2/project/${PROJECT_API_KEY}/render?count=${EC_LIST_LIMIT}&offset=${offset}`,
    headers: { 
      'X-OPENTOK-AUTH': jwt
    }
  };
  // console.log("EC list ", JSON.stringify(config));

  let response = await axios(config);
  console.log("List EC result ", JSON.stringify(response.data));

  if (response.data.items) {
    ecs = ecs.concat(response.data.items);
  }

  if (offset <= response.data.count) {
    offset += EC_LIST_LIMIT;
    ecs = await listExperienceComposer({ jwt, ecs, offset });
  } 
  return ecs;
}

async function deleteExperienceComposer(ecId) {
  let jwt = await generateJwt();

  var config = {
    method: 'delete',
    url: `https://api.opentok.com/v2/project/${PROJECT_API_KEY}/render/${ecId}`,
    headers: { 
      'X-OPENTOK-AUTH': jwt
    }
  };
  console.log("EC delete ", JSON.stringify(config));

  let response = await axios(config);
  console.log("Delete EC result ", JSON.stringify(response.data));
  return response.data;
}

async function startArchiving(sessionId) {
  let jwt = await generateJwt();

  var data = JSON.stringify({
    sessionId,
    hasAudio: true,
    hasVideo: true,
    streamMode: "manual",
    resolution : "1920x1080",
  });

  var config = {
    method: 'post',
    url: `https://api.opentok.com/v2/project/${PROJECT_API_KEY}/archive`,
    headers: { 
      'X-OPENTOK-AUTH': jwt, 
      'Content-Type': 'application/json'
    },
    data
  };
  console.log("Archive start ", JSON.stringify(config));

  let response = await axios(config);
  console.log("Archive start result ", JSON.stringify(response.data));
  return response.data;
}

async function updateArchive(archiveId, streamId) {
  let jwt = await generateJwt();

  var data = JSON.stringify({
    addStream: streamId,
    hasAudio: true,
    hasVideo: true
  });

  var config = {
    method: 'patch',
    url: `https://api.opentok.com/v2/project/${PROJECT_API_KEY}/archive/${archiveId}/streams`,
    headers: { 
      'X-OPENTOK-AUTH': jwt, 
      'Content-Type': 'application/json'
    },
    data
  };
  console.log("Archive update ", JSON.stringify(config));

  let response = await axios(config);
  console.log("Archive update result ", JSON.stringify(response.data));
  return response.data;
}

async function stopArchiving(archiveId) {
  let jwt = await generateJwt();

  var config = {
    method: 'post',
    url: `https://api.opentok.com/v2/project/${PROJECT_API_KEY}/archive/${archiveId}/stop`,
    headers: { 
      'X-OPENTOK-AUTH': jwt
    }
  };
  console.log("Archive stop ", JSON.stringify(config));

  let response = await axios(config);
  console.log("Archive stop result ", JSON.stringify(response.data));
  return response.data;
}

async function listArchives(sessionId, count, offset) {
  let jwt = await generateJwt();

  let url = `https://api.opentok.com/v2/project/${PROJECT_API_KEY}/archive?count=${count ? count : ARCHIVE_LIST_LIMIT}&offset=${offset ? offset : "0"}`;
  if (sessionId) {
    url += `&sessionId=${sessionId}`;
  }

  var config = {
    method: 'get',
    url,
    headers: { 
      'X-OPENTOK-AUTH': jwt
    }
  };
  console.log("Archive list ", JSON.stringify(config));

  let response = await axios(config);
  console.log("Archive list result ", JSON.stringify(response.data));
  return response.data;
}

// ------------------------------------------------------------------------

io.on("connection", async (socket) => {
  console.log(`socket.io connect event`);
  socket.on("join:room", (data) => {
    if (data.roomId) {
      socket.join(`room_${data.roomId}`);
      console.log(`User joined roomId: room_${data.roomId}`);
    }
  });
});

// ------------------------------------------------------------------------

// app.get('/jwtgen', async (req, res, next) => {
//   let jwt = await generateJwt();
//   res.json({ jwt });
// });

// app.get('/clean-all-ec', async (req, res, next) => {
//   let existingExperienceComposers = await listExperienceComposers();
//   console.log(JSON.stringify(existingExperienceComposers));
//   // for (let i = 0; i < existingExperienceComposers.length; i++) {
//   //   if (existingExperienceComposers[i].status !== "stopped") {
//   //     await deleteExperienceComposer(existingExperienceComposers[i].id);
//   //   }
//   // }
//   res.json({ "status": "Ok" });
// });
