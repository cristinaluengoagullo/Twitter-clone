var express = require('express');
var assert = require('assert');
var app = require('./app.js');
var ejs = require('ejs');
var fs = require('fs');
var AM = require('./account-manager.js');
var router = express.Router();
var kafka = require('kafka-node');


////////////////////////////////////////////////////////////////////////////////

// Sets date to UTC format
function setDisplayDate(tweetsToDisplay) {
    tweetsToDisplay.forEach(function(tweet) {
        tweet.display_time = new Date(tweet.created_at).toString();
    });
    return tweetsToDisplay;
}

// NOTE(norswap): This method is necessary because, annoyingly, EJS does not
//  support dynamic includes (including a file whose name is passed via the
//  dictionary -- it has to be hardcoded in the template instead).
function render(res, dict) {
    fs.readFile('views/'+ dict.partial + '.ejs', 'utf-8', function(err, data) {
        assert(!err);
        dict.partial = ejs.render(data, dict);
        res.render('template', dict);
    });
}

////////////////////////////////////////////////////////////////////////////////
// Login page

router.get('/', function(req, res) {

    // check if the user's credentials are saved in a cookie
    if (!req.session.user) {
        return res.render('login', {
            message: 'Hello - Please Login To Your Account' });
    }

    // attempt automatic login
    AM.autoLogin(
        req.session.user.username,
        req.session.user.pass,
        app.users,
    function(user) {
        if (!user)
            return res.render('login', {
                message: 'Hello - Please Login To Your Account' });
        req.session.user = user;
        res.redirect('/home');
    });
});

////////////////////////////////////////////////////////////////////////////////
// Login 

router.post('/validate', function(req, res) {
    // Do manual login with information obtained from the form
    AM.manualLogin(
        req.param('username'),
        req.param('password'),
        app.users,
    function(err, user) {
        res.setHeader('content-type', 'application/json');
        if (!user) {
            res.statusCode = 403;
            var o = {message: err.message};
            res.send(JSON.stringify(o));
            return;
        }
        req.session.user = user;
        var fullUrl = req.protocol + '://' + req.get('host') + '/home';
        var o = {message: 'OK', url: fullUrl}
        res.send(JSON.stringify(o));
    });
});

// Logout
router.post('/logout', function(req, res) {
    req.session.destroy();
    res.redirect('/');
});

////////////////////////////////////////////////////////////////////////////////
// User Profile

router.get('/usr/:username', function(req, res) {
    // Array that will hold the tweets to show
    var resTweets = []
    // Name of the user's profile (initialized as the session user in case it is his/her profile
    var name = req.session.user.name;
    // Render function
    var rend = function(follow, name) {
	    // Render user's profile
	    render(res, {
		title: name + '\'s Profile:',
		partial: 'profile',
		tweets: resTweets,
		username: req.params.username,
		following: follow
	    });
    }
    // Look for the 10 most recent tweets from the user in the tweets collection
    app.tweets.find({username: req.params.username})
    .limit(10)
    .sort({created_at: -1})
    .toArray(function(err, tweets) {
         tweets = setDisplayDate(tweets);
         tweets.forEach(function(tweet) {
	     // Since the tweets collection needs to be consulted, check the user name in it
	     if (name != tweet.name) name = tweet.name;
	     // Construction of the array of tweets
	     resTweets.push(tweet);
         });
    });
    // Check if session user is following the user of the profile. Consult the following array
    // of the session user in the 'following' collection to see whether the user is following
    // him/her or not
    app.following.findOne({username: req.session.user.username}, function(err, user) {
	if (user != null) {
	    if(user.following.indexOf(req.params.username) >= 0){
		rend(true,name);
	    }
	    else rend(false,name);
	}
    });
});

// People the user follows
router.get('/usr/:username/following', function(req, res) {
    // Consult the following array of the user in the 'following' collection
    app.following.findOne({username: req.params.username}, function(err, user) {
	if (user != null){
	    render(res, {
		title: 'Following:',
		partial: 'follow',
		// User's list of people who he/she follows
		follow: user.following
            });
	}
    });
});

// People who follow the user
router.get('/usr/:username/followers', function(req, res) {
    // Consult the followers array of the user in the 'followers' collection
    app.followers.findOne({username: req.params.username}, function(err, user) {
	if (user != null){
	    render(res, {
		title: 'Followers:',
		partial: 'follow',
		follow: user.followers
	    });
	}
    });
});

// Actions taken when the user decides to follow another user
router.get('/usr/:username/follow', function(req, res) {
    if (req.session.user == null) {
        // if user is not logged-in redirect back to login page
        res.send(403);
        return;
    }
    // Update of the following array (add one username) of the user in the database
    app.following.update({username: req.session.user.username}, {$addToSet: {following: req.params.username}}, function(err, records){
	if (records == 0) {
	    res.statusCode = 500;
            var o = {message: err.message};
            res.send(JSON.stringify(o));
	    return;
	}
    });

    // Update of the followers array (add one username) of the other user in the database
    app.followers.update({username: req.params.username}, {$addToSet: {followers: req.session.user.username}}, function(err, records){
	if (records == 0) {
	    res.statusCode = 500;
            var o = {message: err.message};
            res.send(JSON.stringify(o));
	    return;
	}
    });
    res.statusCode = 200;
    res.redirect('/usr/' + req.params.username);
});

// Actions taken when the user decides to unfollow another user
router.get('/usr/:username/unfollow', function(req, res) {
    if (req.session.user == null) {
        // if user is not logged-in redirect back to login page
        res.send(403);
        return;
    }
    // Update of the following array (delete one username) of the user in the database
    app.following.update({username: req.session.user.username}, {$pull: {following: req.params.username}}, function(err, records){
	if (records == 0) {
	    res.statusCode = 500;
            var o = {message: err.message};
            res.send(JSON.stringify(o));
	    return;
	}
    });
    // Update of the followers array (delete one username) of the other user in the database
    app.followers.update({username: req.params.username}, {$pull: {followers: req.session.user.username}}, function(err, records){
	if (records == 0) {
	    res.statusCode = 500;
            var o = {message: err.message};
            res.send(JSON.stringify(o));
	    return;
	}
    });
    res.statusCode = 200;
    res.redirect('/usr/' + req.params.username);
});

////////////////////////////////////////////////////////////////////////////////
// User Timeline

router.get('/home', function(req, res) {
    if (req.session.user == null) {
        // if user is not logged in redirect back to login page
        res.redirect('/');
        return;
    }
   // Array that will hold the tweets of people the user follows 
   var resTweets = [];
   // Look for the following array of the user in the database
   app.following.findOne({username: req.session.user.username},function(err, user) {
        if (err) return console.error(err);
        // Look for tweets of the users contained in the following array of the user
        app.tweets.find({username: {$in: user.following}})
        // Limit the results to 10
        .limit(10)
        // Sort the results decreasingly by date
        .sort({created_at: -1})
        // Transform the results into an array to be able to pass the results to the 'rend' function
	.toArray(function(err, tweets) {
            tweets = setDisplayDate(tweets);
	    // Update the tweets array with new tweet
            tweets.forEach(function(tweet) {
                resTweets.push(tweet);
            });
        });
   });
   // Render user's timeline
   render(res, {
       title: req.session.user.name + '\'s Timeline:',
       partial: 'home',
       tweets: resTweets
   });
});

////////////////////////////////////////////////////////////////////////////////
// User Timeline

// Actions taken when a new tweet is added
router.post('/newTweet', function(req, res) {
    if (req.session.user == null) {
        // if user is not logged-in redirect back to login page
        res.send(403);
        return;
    }
    // Get current date
    var now = new Date(); 
    var now_utc = Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),  now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
    // Create JSON formatted tweet
    var tweet = {"created_at": now, "text": req.param('text'), "username": req.session.user.username, "name": req.session.user.name};
    // Insert tweet in the tweets collection of the database
    app.tweets.insert(tweet, {safe: true}, function(err, records){
	if (!records) {
	    res.statusCode = 500;
            var o = {message: err.message};
            res.send(JSON.stringify(o));
	    return;
	}
        var o = {message: "OK"};
        res.send(JSON.stringify(o));
    });

    // Create kafka producer (the node will work as a producer to kafka, it will provide messages)
    var client = new kafka.Client('localhost:2181');
    app.producer = new kafka.Producer(client);

    // Message to send. It specifies the topic to which it will be feeded, the message (tweet) and the
    // partition number of the topic
    var payloads = [{ topic: 'tweets', messages: tweet.text, partition: 0 }];
    app.producer.on('ready', function () {
	// Send the message to kafka
	app.producer.send(payloads, function (err, data) {
            console.log(data);
	});
    });
    // Executed in case of error
    app.producer.on('error', function (err) {});
});

////////////////////////////////////////////////////////////////////////////////

module.exports = router;
