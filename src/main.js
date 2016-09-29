'use strict';

let fs = require('fs');
let resemble = require('./diff');

resemble.outputSettings({
	errorColor: {
		red: 0,
		green: 0,
		blue: 0
	},
	errorType: 'flat',
	transparency: 0.000001
});

resemble('./data/yetkSBGkbww/first.png')
.compareTo('./data/yetkSBGkbww/second.png')
.ignoreNothing()
.onComplete(function(data) {
	console.log(data);

	let png = data.getDiffImage();
	png.pack().pipe(fs.createWriteStream('diff.png'));
});
