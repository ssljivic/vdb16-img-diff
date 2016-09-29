/*
 Port of the Huddle/Resemble.js for nodejs.

 James Cryer / Huddle 2015
 URL: https://github.com/Huddle/Resemble.js
*/

'use strict';

let PNG = require('pngjs').PNG;
let fs = require('fs');

var _this = {};

let pixelTransparency = 1;

let errorPixelColor = {
	red: 255,
	green: 0,
	blue: 0,
	alpha: 255
};

function colorsDistance(c1, c2) {
	return (Math.abs(c1.r - c2.r) + Math.abs(c1.g - c2.g) + Math.abs(c1.b - c2.b)) / 3;
}

let errorPixelTransform = {
	flat: function() {
		return {
			r: errorPixelColor.red,
			g: errorPixelColor.green,
			b: errorPixelColor.blue,
			a: errorPixelColor.alpha
		};
	},
	movement: function(d1, d2) {
		return {
			r: ((d2.r * (errorPixelColor.red / 255)) + errorPixelColor.red) / 2,
			g: ((d2.g * (errorPixelColor.green / 255)) + errorPixelColor.green) / 2,
			b: ((d2.b * (errorPixelColor.blue / 255)) + errorPixelColor.blue) / 2,
			a: d2.a
		};
	},
	flatDifferenceIntensity: function (d1, d2) {
		return {
			r: errorPixelColor.red,
			g: errorPixelColor.green,
			b: errorPixelColor.blue,
			a: colorsDistance(d1, d2)
		};
	},
	movementDifferenceIntensity: function (d1, d2) {
		let ratio = colorsDistance(d1, d2) / 255 * 0.8;
		return {
			r: ((1 - ratio) * (d2.r * (errorPixelColor.red / 255)) + ratio * errorPixelColor.red),
			g: ((1 - ratio) * (d2.g * (errorPixelColor.green / 255)) + ratio * errorPixelColor.green),
			b: ((1 - ratio) * (d2.b * (errorPixelColor.blue / 255)) + ratio * errorPixelColor.blue),
			a: d2.a
		};
	}
};

let errorPixelTransformer = errorPixelTransform.flat;
let largeImageThreshold = 1200;

_this.diff = function(fileData) {

	let data = {};
	let images = [];
	let updateCallbackArray = [];

	let tolerance = { // between 0 and 255
		red: 16,
		green: 16,
		blue: 16,
		alpha: 16,
		minBrightness: 16,
		maxBrightness: 240
	};

	let ignoreAntialiasing = false;
	let ignoreColors = false;
	let ignoreRectangles = null;
	let scaleToSameSize = false;

	function triggerDataUpdate() {
		let len = updateCallbackArray.length;
		let i;
		for (i = 0; i < len; i++) {
			if (typeof updateCallbackArray[i] === 'function') {
				updateCallbackArray[i](data);
			}
		}
	}

	function loop(w, h, callback) {
		let x, y;

		for (x = 0; x < w; x++) {
			for (y = 0; y < h; y++) {
				callback(x, y);
			}
		}
	}

	function parseImage(sourceImageData, width, height) {
		let pixelCount = 0;
		let redTotal = 0;
		let greenTotal = 0;
		let blueTotal = 0;
		let alphaTotal = 0;
		let brightnessTotal = 0;
		let whiteTotal = 0;
		let blackTotal = 0;

		loop(height, width, function(verticalPos, horizontalPos) {
			let offset = (verticalPos * width + horizontalPos) * 4;
			let red = sourceImageData[offset];
			let green = sourceImageData[offset + 1];
			let blue = sourceImageData[offset + 2];
			let alpha = sourceImageData[offset + 3];
			let brightness = getBrightness(red, green, blue);

			if (red === green && red === blue && alpha) {
				if (red === 0) {
					blackTotal++;
				} else if (red === 255) {
					whiteTotal++;
				}
			}

			pixelCount++;

			redTotal += red / 255 * 100;
			greenTotal += green / 255 * 100;
			blueTotal += blue / 255 * 100;
			alphaTotal += (255 - alpha) / 255 * 100;
			brightnessTotal += brightness / 255 * 100;
		});

		data.red = Math.floor(redTotal / pixelCount);
		data.green = Math.floor(greenTotal / pixelCount);
		data.blue = Math.floor(blueTotal / pixelCount);
		data.alpha = Math.floor(alphaTotal / pixelCount);
		data.brightness = Math.floor(brightnessTotal / pixelCount);
		data.white = Math.floor(whiteTotal / pixelCount * 100);
		data.black = Math.floor(blackTotal / pixelCount * 100);

		triggerDataUpdate();
	}

	function loadImageData(fileData, callback) {
		if (Buffer.isBuffer(fileData)) {
			let png = new PNG();
			png.parse(fileData, function(err, data) {
				callback(data, data.width, data.height);
			});
		} else {
			let ext = fileData.substring(fileData.lastIndexOf('.') + 1);
			if (ext === 'png') {
				let png = new PNG();
				fs.createReadStream(fileData)
				.pipe(png)
				.on('parsed', function() {
					callback(this, this.width, this.height);
				});
			}
		}
	}

	function isColorSimilar(a, b, color) {

		let absDiff = Math.abs(a - b);

		if (typeof a === 'undefined') {
			return false;
		}
		if (typeof b === 'undefined') {
			return false;
		}

		if (a === b) {
			return true;
		} else if (absDiff < tolerance[color]) {
			return true;
		} else {
			return false;
		}
	}

	function isPixelBrightnessSimilar(d1, d2) {
		let alpha = isColorSimilar(d1.a, d2.a, 'alpha');
		let brightness = isColorSimilar(d1.brightness, d2.brightness, 'minBrightness');
		return brightness && alpha;
	}

	function getBrightness(r, g, b) {
		return 0.3 * r + 0.59 * g + 0.11 * b;
	}

	function isRGBSame(d1, d2) {
		let red = d1.r === d2.r;
		let green = d1.g === d2.g;
		let blue = d1.b === d2.b;
		return red && green && blue;
	}

	function isRGBSimilar(d1, d2) {
		let red = isColorSimilar(d1.r, d2.r, 'red');
		let green = isColorSimilar(d1.g, d2.g, 'green');
		let blue = isColorSimilar(d1.b, d2.b, 'blue');
		let alpha = isColorSimilar(d1.a, d2.a, 'alpha');

		return red && green && blue && alpha;
	}

	function isContrasting(d1, d2) {
		return Math.abs(d1.brightness - d2.brightness) > tolerance.maxBrightness;
	}

	function getHue(r, g, b) {

		r = r / 255;
		g = g / 255;
		b = b / 255;
		let max = Math.max(r, g, b),
		min = Math.min(r, g, b);
		let h;
		let d;

		if (max === min) {
			h = 0; // achromatic
		} else {
			d = max - min;
			switch (max) {
				case r:
					h = (g - b) / d + (g < b ? 6 : 0);
					break;
				case g:
					h = (b - r) / d + 2;
					break;
				case b:
					h = (r - g) / d + 4;
					break;
			}
			h /= 6;
		}

		return h;
	}

	function isAntialiased(sourcePix, data, cacheSet, verticalPos, horizontalPos, width) {
		let offset;
		let targetPix;
		let distance = 1;
		let i;
		let j;
		let hasHighContrastSibling = 0;
		let hasSiblingWithDifferentHue = 0;
		let hasEquivalentSibling = 0;

		addHueInfo(sourcePix);

		for (i = distance * -1; i <= distance; i++) {
			for (j = distance * -1; j <= distance; j++) {

				if (!(i === 0 && j === 0)) {
					offset = ((verticalPos + j) * width + (horizontalPos + i)) * 4;
					targetPix = getPixelInfo(data, offset, cacheSet);

					if (targetPix === null) {
						continue;
					}

					addBrightnessInfo(targetPix);
					addHueInfo(targetPix);

					if (isContrasting(sourcePix, targetPix)) {
						hasHighContrastSibling++;
					}

					if (isRGBSame(sourcePix, targetPix)) {
						hasEquivalentSibling++;
					}

					if (Math.abs(targetPix.h - sourcePix.h) > 0.3) {
						hasSiblingWithDifferentHue++;
					}

					if (hasSiblingWithDifferentHue > 1 || hasHighContrastSibling > 1) {
						return true;
					}
				}
			}
		}

		if (hasEquivalentSibling < 2) {
			return true;
		}

		return false;
	}

	function errorPixel(px, offset, data1, data2) {
		let data = errorPixelTransformer(data1, data2);
		px[offset] = data.r;
		px[offset + 1] = data.g;
		px[offset + 2] = data.b;
		px[offset + 3] = data.a;
	}

	function copyPixel(px, offset, data) {
		px[offset] = data.r; //r
		px[offset + 1] = data.g; //g
		px[offset + 2] = data.b; //b
		px[offset + 3] = data.a * pixelTransparency; //a
	}

	function copyGrayScalePixel(px, offset, data) {
		px[offset] = data.brightness; //r
		px[offset + 1] = data.brightness; //g
		px[offset + 2] = data.brightness; //b
		px[offset + 3] = data.a * pixelTransparency; //a
	}

	function getPixelInfo(data, offset) {
		let r;
		let g;
		let b;
		let d;
		let a;

		r = data[offset];

		if (typeof r !== 'undefined') {
			g = data[offset + 1];
			b = data[offset + 2];
			a = data[offset + 3];
			d = {
				r: r,
				g: g,
				b: b,
				a: a
			};

			return d;
		} else {
			return null;
		}
	}

	function addBrightnessInfo(data) {
		data.brightness = getBrightness(data.r, data.g, data.b); // 'corrected' lightness
	}

	function addHueInfo(data) {
		data.h = getHue(data.r, data.g, data.b);
	}

	function analyseImages(img1, img2, width, height) {

		let data1 = img1.data;
		let data2 = img2.data;

		let imgd = new PNG({
			width: img1.width,
			height: img1.height,
			deflateChunkSize: img1.deflateChunkSize,
			deflateLevel: img1.deflateLevel,
			deflateStrategy: img1.deflateStrategy,
		});
		let targetPix = imgd.data;

		let mismatchCount = 0;

		let time = Date.now();

		let skip;

		let currentRectangle = null;
		let rectagnlesIdx = 0;

		if (!!largeImageThreshold && ignoreAntialiasing && (width > largeImageThreshold || height > largeImageThreshold)) {
			skip = 6;
		}

		loop(height, width, function(verticalPos, horizontalPos) {

			if (skip) { // only skip if the image isn't small
				if (verticalPos % skip === 0 || horizontalPos % skip === 0) {
					return;
				}
			}

			let offset = (verticalPos * width + horizontalPos) * 4;
			let pixel1 = getPixelInfo(data1, offset, 1);
			let pixel2 = getPixelInfo(data2, offset, 2);

			if (pixel1 === null || pixel2 === null) {
				return;
			}

			if (ignoreRectangles) {
				for (rectagnlesIdx = 0; rectagnlesIdx < ignoreRectangles.length; rectagnlesIdx++) {
					currentRectangle = ignoreRectangles[rectagnlesIdx];
					//console.log(currentRectangle, verticalPos, horizontalPos);
					if (
						(verticalPos >= currentRectangle[1]) &&
						(verticalPos < currentRectangle[1] + currentRectangle[3]) &&
						(horizontalPos >= currentRectangle[0]) &&
						(horizontalPos < currentRectangle[0] + currentRectangle[2])
					) {
						copyGrayScalePixel(targetPix, offset, pixel2);
						//copyPixel(targetPix, offset, pixel1, pixel2);
						return;
					}
				}
			}

			if (ignoreColors) {

				addBrightnessInfo(pixel1);
				addBrightnessInfo(pixel2);

				if (isPixelBrightnessSimilar(pixel1, pixel2)) {
					copyGrayScalePixel(targetPix, offset, pixel2);
				} else {
					errorPixel(targetPix, offset, pixel1, pixel2);
					mismatchCount++;
				}
				return;
			}

			if (isRGBSimilar(pixel1, pixel2)) {
				copyPixel(targetPix, offset, pixel1, pixel2);

			} else if (ignoreAntialiasing && (
				addBrightnessInfo(pixel1), // jit pixel info augmentation looks a little weird, sorry.
				addBrightnessInfo(pixel2),
				isAntialiased(pixel1, data1, 1, verticalPos, horizontalPos, width) ||
				isAntialiased(pixel2, data2, 2, verticalPos, horizontalPos, width)
			)) {

				if (isPixelBrightnessSimilar(pixel1, pixel2)) {
					copyGrayScalePixel(targetPix, offset, pixel2);
				} else {
					errorPixel(targetPix, offset, pixel1, pixel2);
					mismatchCount++;
				}
			} else {
				errorPixel(targetPix, offset, pixel1, pixel2);
				mismatchCount++;
			}

		});

		data.misMatchPercentage = (mismatchCount / (height * width) * 100).toFixed(2);
		data.analysisTime = Date.now() - time;

		data.getDiffImage = function() {
			return imgd;
		};
	}

	function compare(one, two) {

		function onceWeHaveBoth(img) {
			let width;
			let height;

			images.push(img);
			if (images.length === 2) {
				if (images[0].error || images[1].error) {
					data = {};
					data.error = images[0].error ?  images[0].error : images[1].error;
					triggerDataUpdate();
					return;
				}

				width = images[0].width > images[1].width ? images[0].width : images[1].width;
				height = images[0].height > images[1].height ? images[0].height : images[1].height;

				if ((images[0].width === images[1].width) && (images[0].height === images[1].height)) {
					data.isSameDimensions = true;
				} else {
					data.isSameDimensions = false;
				}

				data.dimensionDifference = {
					width: images[0].width - images[1].width,
					height: images[0].height - images[1].height
				};

				//lksv: normalization removed
				analyseImages(images[0], images[1], width, height);

				triggerDataUpdate();
			}
		}

		images = [];
		loadImageData(one, onceWeHaveBoth);
		loadImageData(two, onceWeHaveBoth);
	}

	function getCompareApi(param) {

		let secondFileData,
		hasMethod = typeof param === 'function';

		if (!hasMethod) {
			// assume it's file data
			secondFileData = param;
		}

		let self = {
			scaleToSameSize: function() {
				scaleToSameSize = true;

				if (hasMethod) { param(); }
				return self;
			},
			useOriginalSize: function() {
				scaleToSameSize = false;

				if (hasMethod) { param(); }
				return self;
			},
			ignoreNothing: function() {

				tolerance.red = 0;
				tolerance.green = 0;
				tolerance.blue = 0;
				tolerance.alpha = 0;
				tolerance.minBrightness = 0;
				tolerance.maxBrightness = 255;

				ignoreAntialiasing = false;
				ignoreColors = false;

				if (hasMethod) { param(); }
				return self;
			},
			ignoreLess: function() {

				tolerance.red = 16;
				tolerance.green = 16;
				tolerance.blue = 16;
				tolerance.alpha = 16;
				tolerance.minBrightness = 16;
				tolerance.maxBrightness = 240;

				ignoreAntialiasing = false;
				ignoreColors = false;

				if (hasMethod) { param(); }
				return self;
			},
			ignoreAntialiasing: function() {

				tolerance.red = 32;
				tolerance.green = 32;
				tolerance.blue = 32;
				tolerance.alpha = 32;
				tolerance.minBrightness = 64;
				tolerance.maxBrightness = 96;

				ignoreAntialiasing = true;
				ignoreColors = false;

				if (hasMethod) { param(); }
				return self;
			},
			ignoreColors: function() {

				tolerance.alpha = 16;
				tolerance.minBrightness = 16;
				tolerance.maxBrightness = 240;

				ignoreAntialiasing = false;
				ignoreColors = true;

				if (hasMethod) { param(); }
				return self;
			},
			//array of rectangles, each rectangle is defined as (x, y, width. height)
			//e.g. [[325, 170, 100, 40]]
			ignoreRectangles: function(rectangles) {
				ignoreRectangles = rectangles;
				return self;
			},
			repaint: function() {
				if (hasMethod) {
					param();
				}
				return self;
			},
			onComplete: function(callback) {

				updateCallbackArray.push(callback);

				let wrapper = function() {
					compare(fileData, secondFileData);
				};

				wrapper();

				return getCompareApi(wrapper);
			}
		};

		return self;
	}

	return {
		onComplete: function(callback) {
			updateCallbackArray.push(callback);
			loadImageData(fileData, function(imageData, width, height) {
				parseImage(imageData.data, width, height);
			});
		},
		compareTo: function(secondFileData) {
			return getCompareApi(secondFileData);
		}
	};

};

_this.diff.outputSettings = function(options) {
	let key;

	if (options.errorColor) {
		// jshint -W089
		for (key in options.errorColor) {
			errorPixelColor[key] = options.errorColor[key] === undefined ? errorPixelColor[key] : options.errorColor[key];
		}
	}

	if (options.errorType && errorPixelTransform[options.errorType]) {
		errorPixelTransformer = errorPixelTransform[options.errorType];
	}

	pixelTransparency = options.transparency || pixelTransparency;

	if (options.largeImageThreshold !== undefined) {
		largeImageThreshold = options.largeImageThreshold;
	}

	return this;
};

module.exports = _this.diff;
