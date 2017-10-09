var elasticsearch = require('elasticsearch');
var path = require('path');
var dotenv = require('dotenv');
var express = require('express');

var app = express();

var client = new elasticsearch.Client({
  host: 'https://search-video-data-domain-lo5oj6jfkwcejhg6y4mirb75ie.us-west-2.es.amazonaws.com', //TODO make this in .env
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

function sortTop10(result){
  return new Promise((resolve, reject) => {
    var top10 = result.slice(0,10);
    var rest = result.slice(10);
    top10.sort(function(a,b){
      return ((b["likeCount"] - b["dislikeCount"])/b["viewCount"]) - ((a["likeCount"] - a["dislikeCount"])/a["viewCount"]);
    })
    result = top10.concat(rest);
    resolve(result);
  })
}


function searchVideoData(searchPhrase) {
  var searchKeywords = searchPhrase.split(" ");
  return new Promise((res, rej) => {
    client.search({
    index: 'youtube-video-data-index',
    body: {
       "from" : 0, "size" : 200, //TODO possibly change this value
        "query": {
          "bool": {
            "should": [
              {
                "match": {
                  "cues.text": searchPhrase
                }
              },
              {
                "match_phrase": {
                   "message" : {
                      "query" : searchPhrase,
                      "boost": 10
                    }
                  }
              },

              {
                "fuzzy": {
                  "cuex.text": searchPhrase
                }
              }
            ]
          }
        },
      "highlight": {
         "order": "score",
          "fields": {
              "cues.text" : {}
          }
      }
    }
    /* "query": {
            "match": { "cues.text": searchPhrase}
        }*/
  }, function(error, response) {
    //res(response.hits.hits);

    response = response.hits.hits;
    var responseLength = response.length;
    response = response.filter((video) => {
      console.log(video);
      return video["_source"]["info"]["statistics"] != null && parseInt(video["_source"]["info"]["statistics"]["viewCount"]) > 1500;
      //TODO remove this during launch and replace with removing bottom 25 percentile if there are > 30 results
    });

    for(var index in response){
      var array = [];
      var aliasHighlight = response[index]["highlight"]["cues.text"];
      for(var highlight in aliasHighlight){
        array.push(aliasHighlight[highlight].replace(/<(\/?|\!?)(em)>/g, ""));
        //array.push(aliasHighlight[highlight].replace(/<[^>]*>/g, ""));
      }
      array = array.slice(0,3);
      // NOTE Only returning top 3 for "relevant cues because that's how many we're rendering in front end"


      response[index]["_source"]["relevantCues"] = response[index]["_source"]["cues"].slice(0);
      var newCue = [];
      newCue = response[index]["_source"]["relevantCues"].filter(function(word){
        return array.includes(word["text"]);
      });
      response[index]["_source"]["relevantCues"] = newCue;
    }

    sortTop10(response).then((response) => res(response.slice(0,20)));

    });
  })
}



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

//TODO pagination route where you request the next 20

app.listen(process.env.PORT || 5000, () => {console.log("Server started")});
