var express = require('express');
var path = require('path');
var favicon = require('serve-favicon');
var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');
var session = require('express-session');
var assert = require('assert');
var mongo = require('mongodb').MongoClient;
var AM = require('./account-manager.js');
var kafka = require('kafka-node');
var app = module.exports = express();
var routes = require('./routes.js');

////////////////////////////////////////////////////////////////////////////////

app.set('env', 'development');

////////////////////////////////////////////////////////////////////////////////
// MIDDLEWARE

app.use(cookieParser());
app.use(session({ secret: 'super-duper-secret-secret',
                  saveUninitialized: true,
                  resave: true}));

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');

// serve static content from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// parse the parameters of POST requests (available through `req.body`)
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

// routes
app.use('/', require('./routes.js'));

// catch 404 and forward to error handler
app.use(function(req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});

////////////////////////////////////////////////////////////////////////////////
// ERROR HANDLERS

// development error handler, will print stacktrace
if (app.get('env') === 'development') {
    app.use(function(err, req, res, next) {
        res.status(err.status || 500);
        console.log('[' + err.status + '] ' + err.message);
        res.render('template', {
            title: 'Error',
            partial: 'error',
            message: err.message,
            error: err
        });
    });
}

// production error handler, no stacktraces leaked to user
app.use(function(err, req, res, next) {
    res.status(err.status || 500);
    res.render('template', {
        title: 'Error',
        partial: 'error',
        message: err.message,
        error: {}
    });
});

////////////////////////////////////////////////////////////////////////////////
// START APP

// 1) Connect to MongoDB
// 2) Connect to Kafka
// 3) Start the HTTP server
mongo.connect('mongodb://localhost:27017/twitter', function(err, db) {
    
    // TODO: error handling
    assert(!err);
    console.log("connected to MongoDB");
    app.db = db;
    // Assignment of collections to app variables.
    app.users  = db.collection('users');
    app.tweets  = db.collection('tweets');
    app.following  = db.collection('following');
    app.followers  = db.collection('followers');

    //Indexes on collections based on the username field to consult less documents in each query.
    // Since all queries are performed on the username, it can be a suited index for the collections.
    db.collection('users').dropAllIndexes(function() {})
    db.ensureIndex("users", {username:1}, function(err, indexname) {
      assert.equal(null, err);
    });

    db.collection('tweets').dropAllIndexes(function() {})
    db.ensureIndex("tweets", {username:1}, function(err, indexname) {
      assert.equal(null, err);
    });

    db.collection('following').dropAllIndexes(function() {})
    db.ensureIndex("following", {username:1}, function(err, indexname) {
      assert.equal(null, err);
    });

    db.collection('followers').dropAllIndexes(function() {})
    db.ensureIndex("users", {username:1}, function(err, indexname) {
      assert.equal(null, err);
    });

    var server = app.listen(3000, function () {
        var host = server.address().address;
        var port = server.address().port;
        console.log('listening at http://%s:%s', host, port);
    });
});

////////////////////////////////////////////////////////////////////////////////

