import { describe, it, before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import path from "path";
import { createHash } from 'node:crypto';

// this test uses an in-memory file system to avoid polluting CWD.
import { fs as memfs, vol } from "memfs";

describe('downloadImage', () => {
    // we have to use dynamic imports for modules that use what we patch
    let fs; // fs-extra
    let downloadImage;

    function dl(url) {
        return downloadImage(url, 'tmp');
    }
    async function assertSize(p, expectedSize) {
        const stat = await fs.stat(path.join('tmp', p));
        assert.equal(stat.size, expectedSize);
    }
    function assertHash(p, expectedDigest) {
        return new Promise(async (res, rej) => {
            const input = await fs.createReadStream(path.join('tmp', p));
            const hash = createHash('sha256');
            input.pipe(hash).setEncoding('hex').on('data', res).on('error', rej);
        }).then((digest) => assert.equal(digest, expectedDigest))
    }

    before(async () => {
        mock.module('node:fs', {cache: true, defaultExport: memfs, namedExports: {...memfs}});

        // graceful-fs does some weird object juggling with fs,
        // which breaks when fs is supplanted with memfs,
        // so here we patch createWriteStream to work around that
        const { default: gfd, ...gf } = await import('graceful-fs');
        mock.module(
            'graceful-fs',
            {
                cache: true,
                defaultExport: gfd,
                namedExports: {
                    createReadStream: (...args) => new memfs.ReadStream(...args),
                    createWriteStream: (...args) => new memfs.WriteStream(...args),
                    ...gf
                }
            }
        );

        const { default: fe } = await import('fs-extra');
        fs = fe;

        const { default: di } = await import('./downloadImage.js');
        downloadImage = di;
    });

    beforeEach(() => {
        vol.reset();
    })

    it('should download an image and return its path', async () => {
        const p = await dl('https://cdn6.fiction.live/file/fictionlive/6dddb2ff-bdf2-418f-9a6d-710ca1c35acb.jpg');
        assert.equal(p, 'cdn6.fiction.live/file/fictionlive/6dddb2ff-bdf2-418f-9a6d-710ca1c35acb.jpg');
        await assertSize(p, 116972);
        await assertHash(p, 'b282d2692dfda5d0e0e18370a7c42e2f861dbfc28e5fa83a323d55aa4145eb42');
    });

    it('should detect file type and append the extension', async () => {
        const p = await dl('https://cdn6.fiction.live/file/fictionlive/447506bd-f804-4312-9f9e-726dc7daa745.jpeg');
        assert.equal(p, 'cdn6.fiction.live/file/fictionlive/447506bd-f804-4312-9f9e-726dc7daa745.jpeg.jpg');
        await assertSize(p, 317425);
        await assertHash(p, '8340b70cf3e54001ee7a750ed7a6a86b590ff7f11cb31a63d31811dd2618c821');
    });
});

