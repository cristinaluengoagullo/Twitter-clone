var express = require('express');
var assert = require('assert');
var app = require('./app.js');
var ejs = require('ejs');
var fs = require('fs');
var AM = require('./account-manager.js');
var router = express.Router();


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
                title: 'Hello - Please Login To Your Account' });

        req.session.user = user;
        res.redirect('/home');
    });
});

////////////////////////////////////////////////////////////////////////////////
// Login / Logout

router.post('/validate', function(req, res) {
    // TODO: Implement user login given req.param('username'), req.param('password')
    AM.manualLogin(
        req.param('username'),
        req.param('password'),
        app.users,
    function(err, user) {
        //assert(!err);
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
    // TODO: render user req.params.username profile (profile.ejs)
    var resTweets = []
    var rend = function(follow) {
	    render(res, {
		title: 'Profile:',
		partial: 'profile',
		tweets: resTweets,
		username: req.params.username,
		following: follow
	    });
    }
    app.tweets.find({username: req.params.username}).toArray(function(err, tweets) {
         tweets = setDisplayDate(tweets);
         tweets.forEach(function(tweet) {
              resTweets.push(tweet);
         });
    });

    if (req.params.username != req.session.user.username) {
	app.following.findOne({username: req.session.user.username}, function(err, user) {
	    if (user != null && user.following.indexOf(req.params.username) >= 0){
		rend(true);
	    }
	    else rend(false);
	});
    }
    else rend(false);
});

router.get('/usr/:username/following', function(req, res) {
    // TODO: render users following user req.params.username
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
    // TODO: render users followed by user req.params.username
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
    app.following.update({username: req.session.user.username}, {$addToSet: {following: req.params.username}}, function(err){
	/*var o = {message: "OK", arr:[req.params.username]}
        res.send(JSON.stringify(o));*/
    });
    res.redirect('/usr/' + req.params.username);
});

router.get('/usr/:username/unfollow', function(req, res) {
    // TODO
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
        app.tweets.find({username: {$in: user.following}}).toArray(function(err, tweets) {
            tweets = setDisplayDate(tweets);
            tweets.forEach(function(tweet) {
                resTweets.push(tweet);
            });
        });
   });
   render(res, {
       title: 'Timeline:',
       partial: 'home',
       tweets: resTweets
   });
});

////////////////////////////////////////////////////////////////////////////////
// User Timeline
router.post('/newTweet', function(req, res) {
    if (req.session.user == null) {
        // if user is not logged-in redirect back to login page
        res.redirect('/');
        return;
    }
    var currentdate = new Date(); 
    var datetime = "Last Sync: " + currentdate.getDate() + "/"
                + (currentdate.getMonth()+1)  + "/" 
                + currentdate.getFullYear() + " @ "  
                + currentdate.getHours() + ":"  
                + currentdate.getMinutes() + ":" 
                + currentdate.getSeconds();
    var tweet = {"created at": datetime, "text": req.param('text'), "name": req.session.user.name, "username": req.session.user.username};
    app.tweets.insert(tweet, {safe: true}, function(){
        var o = {message: "OK", arr:tweet}
        res.send(JSON.stringify(o));
    }); 
});

////////////////////////////////////////////////////////////////////////////////

module.exports = router;
