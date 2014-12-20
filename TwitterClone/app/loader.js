var fs = require('fs');
var byline = require('byline');
var mongo = require('mongodb').MongoClient;
var assert = require('assert');
var AM = require('./account-manager.js');
var noop = function() {};

mongo.connect('mongodb://localhost:27017/twitter', function(err, db) {

  assert.equal(null, err);
  var lineCount     = 0;
  var readAllLines  = false;
  users  = db.collection('users');
  tweets  = db.collection('tweets');
  following = db.collection('following');
  followees = db.collection('followees');

  // TODO: empty the database
  users.remove({}, noop);
  tweets.remove({}, noop);
  following.remove({}, noop);
  followees.remove({}, noop);

  var semaphore = 2;
  function callback(err) {
      --semaphore;
      if (semaphore !== 0) return;
        readAllLines = true;
  }

  var u = byline(fs.createReadStream(__dirname + '/users.json'));

  u.on('data', function(line) {
    try {
      lineCount++;
      var obj = JSON.parse(line);
      //console.log(obj.username);
      // NOTE: obj represents a user and contains three fields:
      // obj.username: the username
      // obj.name: the full name
      // obj.followers: array of users following this user
      // obj.following: array of followed users

      // TODO: load the user into the database
      // (including the information of which users this user is following)
      // decrement the lineCount variable after every insertion
      // if lineCount is equal to zero and readAllLines is true, close db connection
      // using db.close()
      var user = {"username": obj.username, "name": obj.name};
      var userFollowing = {"username": obj.username, "following": obj.following};
      var userFollowees = {"username": obj.username, "followers": obj.followers};  
      AM.addNewAccount(user, users, function()
      {
        if (--lineCount === 0 && readAllLines) {
          // we've read and inserted all lines
          db.close();
      }
      });
      following.insert(userFollowing, {safe: true}, function(){});  
      followees.insert(userFollowees, {safe: true}, function(){});  
    } catch (err) {
      console.log("Error:", err);
    }
  });

  u.on('end', callback);

  var t = byline(fs.createReadStream(__dirname + '/sample.json'));

  t.on('data', function(line) {
    try {
      lineCount++;
      var obj = JSON.parse(line);
      //console.log(obj);
      // NOTE: obj represents a tweet and contains three fields:
      // obj.created_at: UTC time when this tweet was created
      // obj.text: The actual UTF-8 text of the tweet
      // obj.username: The user who posted this tweet

      // TODO: load the tweet into the database
      // decrement the lineCount variable after every insertion
      // if lineCount is equal to zero and readAllLines is true, close db connection
      // using db.close()  
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
