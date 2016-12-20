var _ = require('lodash');
var chalk = require('chalk');
var del = require('del');
var gm = require('gm');
var mkdirp = require('mkdirp');
var path = require('path');
var Promise = require('bluebird');

var mkdirpAsync = Promise.promisify(mkdirp);

/**
 * Constants
 */
var RESIZE = 'resize';

/**
 *
 * @param  {Object} config
 * @return {Penrose}
 */
function Penrose(config) {
  this.config = config;
}

Penrose.prototype = {
  constructor: Penrose,
  /**
   *
   * @param  {Object} style
   * @param  {String} src Path to source image.
   * @param  {String} dist Path to destination image.
   * @return {Promise}
   */
  createDerivative: function (style, src, dist) {
    console.log('Creating derivative image', chalk.cyan(dist));

    var distDir = path.dirname(dist);

    return mkdirpAsync(distDir)
      .then(function () {
        return new Promise(function (resolve, reject) {
          var stream = gm(src);

          _.forEach(style.actions, function (action) {
            if (action.name == RESIZE) {
              stream = stream.resize(action.width, action.height);
            }
            else {
              throw new Error('Action "' + action.name + '" is not supported');
            }
          });

          stream = stream
            .quality(style.quality)
            .noProfile()
            .write(dist, function (err) {
              if (err) {
                reject(err);
              }
              else {
                resolve(dist);
              }
            });
        });
      });
  },
  /**
   *
   * @param  {String} styleName
   * @return {Promise}
   */
  flushStyle: function (styleName) {
    return del([this.config.dist + styleName]);
  },
  /**
   *
   * @param  {String} styleName
   * @param  {String} src Path to source image. Should be inside `srcBase`.
   * @param  {String} srcBase Path to directory containing images.
   * @return {String}
   */
  getDerivativePath: function (styleName, src, srcBase) {
    var dir = this.config.dist + styleName + '/';
    var srcBaseAbs = path.resolve(srcBase);
    var srcAbs = path.resolve(src);

    if (srcAbs.indexOf(srcBaseAbs) !== 0) {
      throw new Error();
    }

    return dir + srcAbs.substring(srcBaseAbs.length + 1);
  }
};

module.exports = {
  /**
   * Constants
   */
  RESIZE: RESIZE,
  Penrose: Penrose
};
