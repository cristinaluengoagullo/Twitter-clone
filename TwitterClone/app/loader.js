var fs = require('fs');
var byline = require('byline');
var mongo = require('mongodb').MongoClient;
var assert = require('assert');
var AM = require('./account-manager.js');
var noop = function() {};

// Connection to the database
mongo.connect('mongodb://localhost:27017/twitter', function(err, db) {

  assert.equal(null, err);
  var lineCount     = 0;
  var readAllLines  = false;

  // Database collections:
  // users: information about the users (username, name, password)
  // tweets: information about the tweets (text, created_at, username, name)
  // following: information about follow relationship (username, following)
  // followers: information about followee relationship (username, followers)  
  users  = db.collection('users');
  tweets  = db.collection('tweets');
  following = db.collection('following');
  followers = db.collection('followers');

  // Empty the database
  users.remove({}, noop);
  tweets.remove({}, noop);
  following.remove({}, noop);
  followers.remove({}, noop);

  var semaphore = 2;
  function callback(err) {
      --semaphore;
      if (semaphore !== 0) return;
        readAllLines = true;
  }

  // Read users information
  var u = byline(fs.createReadStream(__dirname + '/users.json'));

  u.on('data', function(line) {
    try {
      lineCount++;
      var obj = JSON.parse(line);
      // NOTE: obj represents a user and contains three fields:
      // obj.username: the username
      // obj.name: the full name
      // obj.followers: array of users following this user
      // obj.following: array of followed users

      // Load information about use and follow relationships into the database
      var user = {"username": obj.username, "name": obj.name};
      var userFollowing = {"username": obj.username, "following": obj.following};
      var userFollowers = {"username": obj.username, "followers": obj.followers};  
      AM.addNewAccount(user, users, function()
      {
        if (--lineCount === 0 && readAllLines) {
          // we've read and inserted all lines
          db.close();
      }
      });
      following.insert(userFollowing, {safe: true}, function(){});  
      followers.insert(userFollowers, {safe: true}, function(){});  
    } catch (err) {
      console.log("Error:", err);
    }
  });

  u.on('end', callback);

  // Read tweets information
  var t = byline(fs.createReadStream(__dirname + '/sample.json'));

  t.on('data', function(line) {
    try {
      lineCount++;
      var obj = JSON.parse(line);
      // NOTE: obj represents a tweet and contains three fields:
      // obj.created_at: UTC time when this tweet was created
      // obj.text: The actual UTF-8 text of the tweet
      // obj.username: The user who posted this tweet

      // Load tweet into the database
      tweets.insert(obj, {safe: true}, function()
      {
        if (--lineCount === 0 && readAllLines) {
          // we've read and inserted all lines
          db.close();
      }
      });  
    } catch (err) {
      console.log("Error:", err);
    }
  });
  t.on('end', callback);
});
