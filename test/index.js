var _ = require('lodash');
var chai = require('chai');
var assert = chai.assert;
var chaiAsPromised = require('chai-as-promised');
chai.use(chaiAsPromised);
var del = require('del');
var globPromise = require('glob-promise');
var path = require('path');
var Penrose = require('..').Penrose;
var Promise = require('bluebird');

describe('Penrose', function () {
  var testDir = __dirname.substring(process.cwd().length + 1) + '/';

  var config = {
    'srcBase': testDir + 'data/src/',
    'src': [
      testDir + 'data/src/*'
    ],
    'dist': testDir + 'data/dist/',
    'styles': {
      'small': {
        'actions': [{
          'name': 'resize',
          'width': 480
        }],
        'quality': 75
      }
    }
  };

  var penrose = new Penrose(config);

  /**
   *
   * @param  {Array} patterns
   * @param  {Object} options
   * @return {Promise}
   */
  function multiGlob(patterns, options) {
    var matches = [];

    return Promise.mapSeries(patterns, function (pattern) {
        return globPromise(pattern, options)
          .then(function (files) {
            matches = matches.concat(files);
          });
      })
      .then(function () {
        return Promise.resolve(matches);
      });
  }

  beforeEach(function (done) {
    // Delete test output.
    del([config.dist])
      .then(function () {
        done();
      });
  });

  after(function (done) {
    // Delete test output.
    del([config.dist])
      .then(function () {
        done();
      });
  });

  describe('getDerivativePath', function () {
    it('Should return expected path', function () {
      var actual = penrose.getDerivativePath('small', config.srcBase + 'The_Earth_seen_from_Apollo_17.jpg', config.srcBase);
      var expected = config.dist + 'small/The_Earth_seen_from_Apollo_17.jpg';

      assert.equal(actual, expected);
    });
  });

  describe('createDerivative', function () {
    it('Should create derivative images', function () {
      var actual = function () {
        return multiGlob(config.src)
          .then(function (files) {
            var tasks = [];

            _.forEach(files, function (file) {
              _.forEach(config.styles, function (style, styleName) {
                tasks.push({
                  style: style,
                  src: file,
                  dist: penrose.getDerivativePath(styleName, file, config.srcBase)
                });
              });
            });

            return Promise.mapSeries(tasks, function (task) {
              return penrose.createDerivative(task.style, task.src, task.dist);
            });
          })
          .then(function () {
            return multiGlob([config.dist + '**/*'], {
              nodir: true
            });
          });
      };

      var expected = [config.dist + 'small/The_Earth_seen_from_Apollo_17.jpg'];

      return assert.eventually.deepEqual(actual(), expected);
    });
  });
});
