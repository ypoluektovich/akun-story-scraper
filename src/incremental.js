import Akun from 'akun-api';
import Logger from './Logger.js';
import Scraper from './Scraper.js';
import {readOrAskForCredentials} from "./credentials.js";
import IncrementalSaver from "./IncrementalSaver.js";
import StoryList from "./yamlStoryList.js";
import clap from 'clap';

const theCommand = clap.command("incremental [target...]")
	.option('-v, --verbose', 'Verbose (debug) output');

async function start() {
	const cli = theCommand.run();

	const logger = new Logger({debug: !!cli.options.verbose});

	const akun = new Akun({
		hostname: 'fiction.live'
	});

	await readOrAskForCredentials(akun, logger);

	const outputDirectory = '.';

	const scraper = new Scraper({
		akun,
		logger,
		outputDirectory
	});

	const storyList = new StoryList({workDir: outputDirectory});
	let targets = await storyList.read();
	const selectedIds = new Set(cli.args);
	if (selectedIds.size) {
		targets = targets.filter((t) => selectedIds.has(t.id));
	}

	for (const {id, chatMode, downloadImages, author} of targets) {
		try {
			await scraper.archiveStory({
				storyId: id,
				chatMode,
				user: author,
				downloadImages,
				saver: new IncrementalSaver({workDir: outputDirectory})
			});
		} catch (err) {
			logger.error(`Unable to archive story ${id}: ${err}`);
			await scraper.logFatQuest(id);
		}
	}

	logger.log('\n\nFinished archiving!');
}

start().catch(console.error);
