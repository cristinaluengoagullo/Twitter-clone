var express = require('express');
var assert = require('assert');
var app = require('./app.js');
var ejs = require('ejs');
var fs = require('fs');
var AM = require('./account-manager.js');
var router = express.Router();
var kafka = require('kafka-node');


////////////////////////////////////////////////////////////////////////////////

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
// Login / Logout

router.post('/validate', function(req, res) {
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

router.post('/logout', function(req, res) {
    req.session.destroy();
    res.redirect('/');
});

////////////////////////////////////////////////////////////////////////////////
// User Profile

router.get('/usr/:username', function(req, res) {
    var resTweets = []
    var name = req.session.user.name;
    var rend = function(follow, name) {
	    render(res, {
		title: name + '\'s Profile:',
		partial: 'profile',
		tweets: resTweets,
		username: req.params.username,
		following: follow
	    });
    }
    app.tweets.find({username: req.params.username})
    .limit(10)
    .sort({created_at: -1})
    .toArray(function(err, tweets) {
         tweets = setDisplayDate(tweets);
         tweets.forEach(function(tweet) {
	     if (name != tweet.name) name = tweet.name;
	     resTweets.push(tweet);
         });
    });
    app.following.findOne({username: req.session.user.username}, function(err, user) {
	if (user != null && user.following.indexOf(req.params.username) >= 0){
	    rend(true,name);
	}
	else rend(false,name);
    });
});

router.get('/usr/:username/following', function(req, res) {
    app.following.findOne({username: req.params.username}, function(err, user) {
	var userFollowing = [];
	if (user != null){
	    userFollowing = user.following;
	}
	render(res, {
            title: 'Following:',
            partial: 'follow',
            follow: userFollowing
        });
    });
});

router.get('/usr/:username/followers', function(req, res) {
    app.followers.findOne({username: req.params.username}, function(err, user) {
	var userFollowers = [];
	if (user != null){
	    userFollowers = user.followers;
	}
	render(res, {
            title: 'Followers:',
            partial: 'follow',
            follow: userFollowers
        });
    });
});

router.get('/usr/:username/follow', function(req, res) {
    if (req.session.user == null) {
        // if user is not logged-in redirect back to login page
        res.send(403);
        return;
    }
    app.following.update({username: req.session.user.username}, {$addToSet: {following: req.params.username}}, function(err, records){
	if (records == 0) {
	    res.statusCode = 500;
            var o = {message: err.message};
            res.send(JSON.stringify(o));
	    return;
	}
    });
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

router.get('/usr/:username/unfollow', function(req, res) {
    if (req.session.user == null) {
        // if user is not logged-in redirect back to login page
        res.send(403);
        return;
    }
    app.following.update({username: req.session.user.username}, {$pull: {following: req.params.username}}, function(err, records){
	if (records == 0) {
	    res.statusCode = 500;
            var o = {message: err.message};
            res.send(JSON.stringify(o));
	    return;
	}
    });
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
   var resTweets = [];
   app.following.findOne({username: req.session.user.username},function(err, user) {
        if (err) return console.error(err);
        app.tweets.find({username: {$in: user.following}})
        .limit(10)
        .sort({created_at: -1})
	.toArray(function(err, tweets) {
            tweets = setDisplayDate(tweets);
            tweets.forEach(function(tweet) {
                resTweets.push(tweet);
            });
        });
   });
   render(res, {
       title: req.session.user.name + '\'s Timeline:',
       partial: 'home',
       tweets: resTweets
   });
});

////////////////////////////////////////////////////////////////////////////////
// User Timeline
router.post('/newTweet', function(req, res) {
    if (req.session.user == null) {
        // if user is not logged-in redirect back to login page
        res.send(403);
        return;
    }
    var now = new Date(); 
    var now_utc = Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(),  now.getUTCHours(), now.getUTCMinutes(), now.getUTCSeconds());
    var tweet = {"created_at": now, "text": req.param('text'), "name": req.session.user.name, "username": req.session.user.username, "name": req.session.user.name};
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

    var client = new kafka.Client('localhost:2181');
    app.producer = new kafka.Producer(client);

    var payloads = [{ topic: 'tweets', messages: tweet.text, partition: 0 }];
    app.producer.on('ready', function () {
	app.producer.send(payloads, function (err, data) {
            console.log(data);
	});
    });
    app.producer.on('error', function (err) {});
});

////////////////////////////////////////////////////////////////////////////////

module.exports = router;
