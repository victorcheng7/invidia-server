var elasticsearch = require('elasticsearch');
var path = require('path');
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

function median(values) {
    values.sort( function(a,b) {return a - b;} );
    var half = Math.floor(values.length/2);
    if(values.length % 2) return values[half];
    return (values[half-1] + values[half]) / 2.0;
}

function returnMedianViewCount(result){
  let viewCountArray = []; //NOTE make array of viewCounts and pass into median() to return median
  for(video in result){
    viewCountArray.push(result[video]["_source"]["info"]["statistics"]["viewCount"]); //TODO error cannot read viewCount of undefined
  }
  return median(viewCountArray);
}

function sortResults(result){
  return new Promise((resolve, reject) => {
    const checkResult = Object.assign({}, result);
    result.sort( function(a,b){ return b["_source"]["relevantScore"]-a["_source"]["relevantScore"]}); //NOTE sort based on relevant scores
    result === checkResult ? console.log(true) : console.log(false);
    var median = returnMedianViewCount(result);
    var top50 = [];
    var bottom50 = [];
    for(video in result){
      var viewCount = result[video]["_source"]["info"]["statistics"]["viewCount"];
      if(viewCount >= median) top50.push(result[video]);
      else bottom50.push(result[video]);
    }
    resolve();
  })
}

async function sortElastic(results){ //these are top 50
  await sortResults(results);
}

function searchVideoData(searchPhrase) {
  var searchKeywords = searchPhrase.split(" ");

  return new Promise((res, rej) => {
    client.search({
    index: 'youtube-video-data-index',
    body: {
       "from" : 0, "size" : 20,
        "query": {
            "match": { "cues.text": searchPhrase}
        },
        "highlight": {
           "order": "score",
            "fields": {
                "cues.text" : {}
            }
        }
    }
  }, function(error, response) {
    //res(response.hits.hits);
    response = response.hits.hits;
    for(var index in response){
      var array = [];
      var aliasHighlight = response[index]["highlight"]["cues.text"];
      for(var highlight in aliasHighlight){
        array.push(aliasHighlight[highlight].replace(/<[^>]*>/g, ""));
      }

      response[index]["_source"]["relevantCues"] = response[index]["_source"]["cues"].slice(0);
      var newCue = [];
      newCue = response[index]["_source"]["relevantCues"].filter(function(word){
        return array.includes(word["text"]);
      });
      response[index]["_source"]["relevantCues"] = newCue;
    }

//TODO once relevantScore is added, i just have to sort results
    res(response);

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
  console.log(req.query.q);
  searchVideoData(req.query.q)
  .then((data) => {
    //console.log(data);
    res.json(data);

  });
});

app.listen(process.env.PORT || 5000, () => {console.log("Server started")});
