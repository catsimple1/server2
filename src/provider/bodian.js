const insure = require('./insure');
const select = require('./select');
const crypto = require('../crypto');
const request = require('../request');
const { getManagedCacheStorage } = require('../cache');
const url = require('url');


const format = (song) => ({
  id: song.MUSICRID.split('_').pop(),
  name: song.SONGNAME,
  duration: song.DURATION * 1000,
  album: { id: song.ALBUMID, name: song.ALBUM },
  artists: song.ARTIST.split('&').map((name, index) => ({
    id: index ? null : song.ARTISTID,
    name,
  })),
});


const generateSign = (str) => {
  const currentTime = Date.now();
  str += `&timestamp=${currentTime}`;
  const questionMarkIndex = str.indexOf('?');
  const baseUrl = str.substring(0, questionMarkIndex);
  const filteredChars = str
    .substring(questionMarkIndex + 1)
    .replace(/[^a-zA-Z0-9]/g, '')
    .split('');
  filteredChars.sort();
  const dataToEncrypt = `kuwotest${filteredChars.join('')}${url.parse(baseUrl).path}`;
  const md5 = crypto.createHash('md5').update(dataToEncrypt).digest('hex');
  return `${str}&sign=${md5.toLowerCase()}`;
};

const search = (info) => {
  const keyword = encodeURIComponent(info.keyword.replace(' - ', ' '));
  const searchUrl =
    'http://search.kuwo.cn/r.s?&correct=1&stype=comprehensive&encoding=utf8' +
    '&rformat=json&mobi=1&show_copyright_off=1&searchapi=6&all=' +
    keyword;

  return request('GET', searchUrl)
    .then((response) => response.json())
    .then((jsonBody) => {
      if (
        !jsonBody ||
        jsonBody.content.length < 2 ||
        !jsonBody.content[1].musicpage ||
        jsonBody.content[1].musicpage.abslist.length < 1
      )
        return Promise.reject();
      const list = jsonBody.content[1].musicpage.abslist.map(format);
      const matched = select(list, info);
      return matched ? matched.id : Promise.reject();
    });
};

const sendAdFreeRequest = async () => {
  const adurl =
    'http://bd-api.kuwo.cn/api/service/advert/watch?uid=-1&token=&timestamp=1724306124436&sign=15a676d66285117ad714e8c8371691da';
  const headers = {
    'user-agent': 'Dart/2.19 (dart:io)',
    plat: 'ar',
    channel: 'aliopen',
    devid: '114514114514',
    ver: '3.9.0',
    host: 'bd-api.kuwo.cn',
    qimei36: '1e9970cbcdc20a031dee9f37100017e1840e',
    'content-type': 'application/json; charset=utf-8',
  };
  const data = JSON.stringify({
    type: 5,
    subType: 5,
    musicId: 0,
    adToken: '',
  });

  const response = await request('POST', adurl, {
    headers,
    body: data,
  });
  if (typeof response.body === 'object') {
    console.log('bodian ad free response:', response.body);
  }
};

const track = async (id) => {
  const headers = {
    'user-agent': 'Dart/2.19 (dart:io)',
    plat: 'ar',
    channel: 'aliopen',
    devid: '114514114514',
    ver: '3.9.0',
    host: 'bd-api.kuwo.cn',
    'X-Forwarded-For': '1.0.1.114',
  };
  let audioUrl = `http://bd-api.kuwo.cn/api/play/music/v2/audioUrl?&br=${[
    '2000kflac',
    '320kmp3',
  ]
    .slice(select.ENABLE_FLAC ? 0 : 1)
    .join('|')}&musicId=${id}`;
  audioUrl = generateSign(audioUrl);
  try {
    let response = await request('GET', audioUrl, { headers });
    if (response.statusCode !== 200) {
      await sendAdFreeRequest();
      response = await request('GET', audioUrl, { headers });
      if (response.statusCode !== 200) insure().kuwo.track(id);
    }
    const body = await response.body();
    const urlMatch = (body.match(/http[^\s$"]+/) || [])[0];
    return urlMatch || insure().kuwo.track(id);
  } catch (error) {
    return insure().kuwo.track(id);
  }
};

const cs = getManagedCacheStorage('provider/bodian');
// 使用 const 声明检查函数
const check = (info) => cs.cache(info, () => search(info)).then(track);

module.exports = { check, track };
