var Promise = require('bluebird');
var Snoocore = require('snoocore');
var SpotifyWebApi = require('spotify-web-api-node');
var moment = require('moment');
var _ = require('lodash');

var config = require('./config');

var spotifyApi = new SpotifyWebApi({
  clientId : config.spotify.client.id,
  clientSecret : config.spotify.client.secret,
});

var reddit = new Snoocore({
  userAgent: '/u/georgehotelling NewMusicFriday-Bot v0.1', 
  oauth: {
    type: 'script',
    key: config.reddit.appKey,
    secret: config.reddit.secret,
    username: config.reddit.username,
    password: config.reddit.password,
    scope: [ 'submit', 'modposts' ]
  }
});

spotifyApi.clientCredentialsGrant()
  .then(function(data) {
    spotifyApi.setAccessToken(data.body['access_token']);
    return spotifyApi.getPlaylist(config.spotify.playlist.user, config.spotify.playlist.id);
  })
  .then(postPlaylist)
  .then(postTracksToPlaylist)
  .then(function() {
      console.log('DONE!');
  })
  .catch(function() {
      console.log('FAILED!');
      console.log(arguments);
  });

function postPlaylist(spotifyRes) {
    return reddit('/api/submit').post({
                'api_type': 'json',
                'kind': 'link', // one of (link, self)
                'resubmit': true, // boolean value
                'sendreplies': false, // boolean value
                'sr': config.reddit.subreddit,
                'title': _.get(spotifyRes, 'body.name') + ' - ' + moment().format('MMMM Do, YYYY'),
                'url': _.get(spotifyRes, 'body.external_urls.spotify')
            })
        .then(function(redditPostRes) {
            var errors = _.get(redditPostRes, 'json.errors', []);
            if (errors.length > 0) {
                return Promise.reject(errors);
            }
            
            return {
                spotify: spotifyRes,
                reddit: redditPostRes
            };
        })
        .then(stickyPost);
}

function postTracksToPlaylist(response) {
    return Promise.all(response.spotify.body.tracks.items.map(function(item) {
        var artists = item.track.artists.map(function (a) { return a.name; }).join(', ');
        var title = artists + ' - ' + item.track.name;

        return reddit('/api/comment').post({
                'api_type': 'json',
                'text': '[' + title + '](' + _.get(item, 'track.external_urls.spotify') + ')',
                'thing_id': response.reddit.json.data.name
            })
            .then(function() {
                console.log('Posted ' + title);
                return(arguments);
            });
    }));
}

function stickyPost(response) {
    return reddit('/api/set_subreddit_sticky').post({
            id: response.reddit.json.data.name,
            num: 1,
            state: true
        })
        .then(function() {
            return response;
        });
}
