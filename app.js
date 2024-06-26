const createError = require('http-errors');
const express = require('express');
const cookieParser = require('cookie-parser');
const logger = require('morgan');
const path = require('path');
require('dotenv').config();

const indexRouter = require('./routes/index');

const session = require('express-session');
const flash = require('connect-flash');
const msal = require('@azure/msal-node');

const authRouter = require('./routes/auth');
const emailRouter = require('./routes/email');

const client = require('./elasticsearch/client');

const app = express();

app.use(express.static(path.join(__dirname, 'public')));

app.locals.users = {};

const msalConfig = {
  auth: {
    clientId: process.env.OAUTH_CLIENT_ID || '',
    authority: process.env.OAUTH_AUTHORITY,
    clientSecret: process.env.OAUTH_CLIENT_SECRET,
  },
  system: {
    loggerOptions: {
      loggerCallback(loglevel, message, containsPii) {
        if (!containsPii) console.log(message);
      },
      piiLoggingEnabled: false,
      logLevel: msal.LogLevel.Verbose,
    },
  },
};

app.locals.esClient = client;
app.locals.msalClient = new msal.ConfidentialClientApplication(msalConfig);

app.use(
  session({
    secret: process.env.EXPRESS_SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    unset: 'destroy',
  })
);

app.use(flash());

app.use(function (req, res, next) {
  res.locals.error = req.flash('error_msg');

  const errs = req.flash('error');
  for (let i in errs) {
    res.locals.error.push({ message: 'An error occurred', debug: errs[i] });
  }

  if (req.session.userId) {
    res.locals.user = app.locals.users[req.session.userId];
  }

  next();
});

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/api/emails', emailRouter);

app.get('/emails', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/emails.html'));
});

app.get('/api/session', (req, res) => {
  res.json(req.session);
});

app.use('/test-elasticsearch', async (req, res, next) => {
  try {
    const result = await client.ping();
    res.json({ message: 'Elasticsearch is running', result });
  } catch (error) {
    next(error);
  }
});

app.use(function (req, res, next) {
  next(createError(404));
});

app.use(function (err, req, res) {
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  res.status(err.status || 500);
  res.render('error');
});

app.listen(3000, () => {
  console.log('Server is running on port 3000');
});
