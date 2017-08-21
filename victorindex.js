var elasticsearch = require('elasticsearch');
var path = require('path');
var Fuse = require('fuse.js');
var express = require('express');

var app = express();

var client = new elasticsearch.Client({
  host: 'https://search-video-data-domain-lo5oj6jfkwcejhg6y4mirb75ie.us-west-2.es.amazonaws.com',
  log: []
});

function connectToClient() {
  client.ping({
    requestTimeout: 30000,
  }, function (error) {
    if (error) {
      console.error('Elasticsearch cluster is down!');
    } else {
      console.log('Elasticsearch cluster connection working.');
    }
  });
}

function searchVideoData(searchPhrase) {
  var searchKeywords = searchPhrase.split(" ");

  return new Promise((res, rej) => {
    client.search({
    index: 'youtube-video-data-index',
    body: {
      query: {
        match: {
          "cues.text": searchPhrase
        }
      }
    }
  }, function(error, response) {
    //res(response.hits.hits);
    var options = {
        shouldSort: true,
        tokenize: true,
        matchAllTokens: true,
        findAllMatches: true,
        //includeScore: true,
        //includeMatches: true,
        threshold: 0.4,
        location: NaN,
        distance: 100,
        maxPatternLength: 32,
        minMatchCharLength: 1,
        keys: [
          "text"
        ]
    };
/* -------------------------- Combine one snippet cue into one -------------------- */
    var combineThreeSnips = [];
    response.hits.hits.forEach((item, index) =>{
      var cues = item._source.cues;
      var i = 0;
      while(i < cues.length){
        console.log("THIS IS CUES: ", cues[i].text);

        if(typeof(cues[i+1]) == 'undefined'){
          cues[i+1] = {}
          cues[i+1].text = "";
          cues[i+1].duration = 0;
        }
        if(typeof(cues[i+2]) == 'undefined'){
          cues[i+2] = {};
          cues[i+2].text = "";
          cues[i+2].duration = 0;
        }

        var toBePushed = {
              "text": `${cues[i].text} ${cues[i+1].text} ${cues[i+2].text}`,
              "timestamp": cues[i].timestamp,
              "duration": (parseFloat(cues[i].duration) || 0) + (parseFloat(cues[i+1].duration) || 0) + (parseFloat(cues[i+2].duration) || 0)
            }

          combineThreeSnips.push(toBePushed);
          i += 3;
      }
      response.hits.hits[index]._source.cues = combineThreeSnips;
    });


/* ---------------------------- END --------------------------------------------------  */

    //response.hits.hits[i]
    console.log('Response: ' + JSON.stringify(response));

    var removeList = [];
    response.hits.hits.forEach((item, index) => {
      var fuse = new Fuse(item._source.cues, options); // "list" is the item array
      var oneResult = fuse.search(searchPhrase);
      console.log(oneResult);
      //oneResult.sort((a, b) => { return parseFloat(a.timestamp) - parseFloat(b.timestamp) });
      item._source.cues = oneResult;
      if (oneResult.length === 0){
        removeList.push(index);
      }
    });
    console.log("RemoveList: ", removeList);
    var tempCount = 0;
    removeList.forEach((index) =>{
      response.hits.hits.splice(index-tempCount,1);
      tempCount++;
    });
    /*
    for (var i = 0; i < response.hits.hits.length; i++) {
      var fuse = new Fuse(response.hits.hits[i]._source.cues, options); // "list" is the item array
      var oneResult = fuse.search(searchPhrase);
      if oneResult.length == 0{
        missingCues.push(i);
      }
      response.hits.hits[i]._source.cues = oneResult;
    }*/
    res(response.hits.hits);


    });
  })
}
/*

Pseudocode
1) Combine 3 of the results into a longer duration
2)

Try it with match all toekns and find all tokens. If not enough matches, try it without match all tokens
*/


connectToClient();

app.get("/search", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  searchVideoData(req.query.q)
  .then((data) => {
    //console.log(data);
    res.json(data);

  });
});

app.listen(process.env.PORT || 5000, () => console.log("Server started"));
