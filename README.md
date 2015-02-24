# node-omxplayer

## Objective

Control omxplayer by node API

## Installation

    $ npm install omxplayer

## Usage

Launch omxplayer :
```javascript
var configuration = {};
var omxplayer = new OMXPlayer(configuration);

omxplayer.start("movie.mkv", function(error) {
});

omxplayer.on("prop:position", function(newPosition) {
	
});

```
