import fs from 'fs-extra';
import imageType from 'image-type';
import path from 'path';
import request from 'request';
import sanitize from 'sanitize-filename';
import {Transform} from 'stream';

class ImageTypeIntercept extends Transform {
	constructor(options) {
		super(options);
		this._firstChunkHandled = false;
	}

	_transform(chunk, encoding, callback) {
		if (!this._firstChunkHandled) {
			this._firstChunkHandled = true;
			this.emit('imageType', imageType(chunk));
		}
		this.push(chunk);
		callback();
	}
}

export default async function downloadImage(imageUrl, dest) {
	const url = new URL(imageUrl);
	const segments = url.href.replace(`${url.protocol}//`, '').split('/').map(segment => sanitize(segment, {replacement: '!'}));
	let imagePath = path.join(...segments);

	await fs.ensureDir(path.join(dest, path.dirname(imagePath)));

	await new Promise((res, rej) => {
		try {
			let receivedData = false;
			const imageReadable = request(imageUrl);
			const intercept = new ImageTypeIntercept();
			imageReadable.on('data', () => {
				receivedData = true;
			});
			imageReadable.on('close', () => {
				if (!receivedData) {
					intercept.removeAllListeners('imageType');
					rej(`Response has no data for ${imageUrl}`);
				}
			});
			imageReadable.pipe(intercept);
			intercept.on('imageType', (type) => {
				try {
					if (type) {
						const {ext} = type;
						if (path.extname(imagePath) !== `.${ext}`) {
							imagePath += `.${ext}`;
						}
					}
					const fileWriteable = fs.createWriteStream(path.join(dest, imagePath), {encoding: null});
					intercept.pipe(fileWriteable);
					fileWriteable.once('close', () => {
						res();
					});
					fileWriteable.once('error', (err) => {
						rej(err);
					});
				} catch (err) {
					rej(err);
				}
			});
			imageReadable.once('error', (err) => {
				rej(err);
			});
			intercept.once('error', (err) => {
				rej(err);
			});
		} catch (err) {
			rej(err);
		}
	});

	return imagePath;
}
