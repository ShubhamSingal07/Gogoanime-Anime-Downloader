const fs = require('fs');
const { default: axios } = require('axios');
const cheerio = require('cheerio');
const path = require('path');

const GOGOANIME_HOST = 'https://www2.gogoanime.ee';

module.exports = {
  command: 'download',
  describe: 'Downloads the given anime',

  handler: async opts => {
    try {
      const animeName = opts._[1];
      const fromEpisode = Number(opts._[2].split('-')[1]);
      const toEpisode = Number(opts._[3].split('-')[1]);

      await downloadAnime(animeName, fromEpisode, toEpisode);
      process.exit(0);
    } catch (error) {
      console.error('\nError:');
      console.error(error);
      process.exit(1);
    }
  },
};

const convertHtmlStringToDom = htmlString => {
  return cheerio.load(htmlString);
};

const downloadAnime = async (animeName, fromEpisode, toEpisode) => {
  let downloadPromises = [];
  const incConn = 5;
  let conncurrentConn = incConn;

  for (let currEpisode = fromEpisode; currEpisode <= toEpisode; currEpisode++) {
    try {
      const fileName = `episode-${currEpisode}`;

      const res = await axios.get(`${GOGOANIME_HOST}/${animeName}-${fileName}`);
      const $ = convertHtmlStringToDom(res.data);

      let xstreamLink = $('li.xstreamcdn a').first().data('video');
      xstreamLink = xstreamLink.replace('/v/', '/api/source/');

      const xstreamRes = await axios.post(xstreamLink);

      const videoLinks = xstreamRes.data.data;

      videoLinks.sort((a, b) => parseInt(b.label) - parseInt(a.label));
      const highestQualityVideoLinkObj = videoLinks[0];

      const promise = MakeQuerablePromise(
        downloadVideo(animeName, fileName, highestQualityVideoLinkObj),
      );
      downloadPromises.push(promise);

      if (downloadPromises.length === conncurrentConn) {
        await Promise.any(downloadPromises);
        downloadPromises = downloadPromises.filter(dp => dp.isPending());

        if (conncurrentConn < 10) {
          conncurrentConn += incConn - 2;
          conncurrentConn = Math.min(conncurrentConn, 10);
        }

        continue;
      }
    } catch (err) {
      throw err;
    }
  }
};

const downloadVideo = (animeName, fileName, fileObj) => {
  try {
    createFolderIfNotExists(animeName);
    const filepath = path.join(
      __dirname,
      `../${animeName}/${fileName}-${fileObj.label}.${fileObj.type}`,
    );
    const writer = fs.createWriteStream(filepath);

    const opts = { method: 'get', url: fileObj.file, responseType: 'stream' };

    console.log(`Started downloading ${animeName} ${fileName}`);
    return axios(opts).then(response => {
      return new Promise((resolve, reject) => {
        response.data.pipe(writer);

        let error = null;
        writer.on('error', err => {
          error = err;
          writer.close();
          reject(err);
        });
        writer.on('close', () => {
          if (!error) {
            console.log(`Downloaded ${fileName}`);
            resolve(true);
          }
        });
      });
    });
  } catch (err) {
    throw err;
  }
};

const createFolderIfNotExists = folderName => {
  const dir = path.join(__dirname, `../${folderName}`);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

function MakeQuerablePromise(promise) {
  // Don't modify any promise that has been already modified.
  if (promise.isFulfilled) return promise;

  // Set initial state
  var isPending = true;
  var isRejected = false;
  var isFulfilled = false;

  // Observe the promise, saving the fulfillment in a closure scope.
  var result = promise.then(
    function (v) {
      isFulfilled = true;
      isPending = false;
      return v;
    },
    function (e) {
      isRejected = true;
      isPending = false;
      throw e;
    },
  );

  result.isFulfilled = function () {
    return isFulfilled;
  };
  result.isPending = function () {
    return isPending;
  };
  result.isRejected = function () {
    return isRejected;
  };
  return result;
}
