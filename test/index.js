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
    'schemes': {
      'public': {
        'path': testDir + 'data/files/'
      }
    },
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

  /**
   * Deletes test output files.
   *
   * @return {Promise}
   */
  function deleteOutput() {
    var dirs = _.map(config.schemes, function (scheme) {
      return scheme.path + 'styles/';
    }).concat([
      config.schemes.public.path + 'math/'
    ]);

    return del(dirs);
  }

  beforeEach(function (done) {
    deleteOutput()
      .then(function () {
        done();
      });
  });

  after(function (done) {
    deleteOutput()
      .then(function () {
        done();
      });
  });

  describe('resolvePath', function () {
    it('Should return expected path if URI has scheme', function () {
      var actual = penrose.resolvePath('public://dir/file.jpg');
      var expected = config.schemes.public.path + 'dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should return expected path if URI has no scheme', function () {
      var actual = penrose.resolvePath('dir/file.jpg');
      var expected = 'dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should throw error if URI has unsupported scheme', function () {
      var actual;
      var expected = 'error';

      try {
        actual = penrose.resolvePath('http://dir/file.jpg');
      }
      catch (e) {
        actual = e;
      }

      assert.typeOf(actual, expected);
    });
  });

  describe('getScheme', function () {
    it('Should return expected scheme if URI has scheme', function () {
      var actual = penrose.getScheme('public://dir/file.jpg');
      var expected = 'public';

      assert.equal(actual, expected);
    });

    it('Should return undefined scheme if URI has no scheme', function () {
      var actual = penrose.getScheme('dir/file.jpg');
      var expected = undefined;

      assert.equal(actual, expected);
    });
  });

  describe('getTarget', function () {
    it('Should return expected target if URI has scheme', function () {
      var actual = penrose.getTarget('public://dir/file.jpg');
      var expected = 'dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should return expected target if URI has no scheme', function () {
      var actual = penrose.getTarget('dir/file.jpg');
      var expected = 'dir/file.jpg';

      assert.equal(actual, expected);
    });
  });

  describe('getURL', function () {
    it('Should return expected URL if URI has scheme', function () {
      var actual = penrose.getURL('public://dir/file.jpg');
      var expected = '/' + config.schemes.public.path + 'dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should return expected URL if URI has no scheme', function () {
      var actual = penrose.getURL('dir/file.jpg');
      var expected = 'dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should return expected URL if URI has unsupported scheme', function () {
      var actual = penrose.getURL('http://dir/file.jpg');
      var expected = 'http://dir/file.jpg';

      assert.equal(actual, expected);
    });
  });

  describe('getStylePath', function () {
    it('Should return expected path if URI has scheme', function () {
      var actual = penrose.getStylePath('small', 'private://dir/file.jpg');
      var expected = 'private://styles/small/dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should return expected path if URI has no scheme', function () {
      var actual = penrose.getStylePath('small', 'dir/file.jpg');
      var expected = 'public://styles/small/dir/file.jpg';

      assert.equal(actual, expected);
    });
  });

  describe('getStyleURL', function () {
    it('Should return expected URL if URI has scheme', function () {
      var actual = penrose.getStyleURL('small', 'public://dir/file.jpg');
      var expected = '/' + config.schemes.public.path + 'styles/small/dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should return expected URL if URI has no scheme', function () {
      var actual = penrose.getStyleURL('small', 'dir/file.jpg');
      var expected = '/' + config.schemes.public.path + 'styles/small/dir/file.jpg';

      assert.equal(actual, expected);
    });

    it('Should throw error if URI has unsupported scheme', function () {
      var actual;
      var expected = 'error';

      try {
        actual = penrose.getStyleURL('small', 'http://dir/file.jpg');
      }
      catch (e) {
        actual = e;
      }

      assert.typeOf(actual, expected);
    });
  });

  describe('createDerivative', function () {
    it('Should create derivative images', function () {
      var actual = function () {
        return multiGlob(_.map(config.schemes, function (scheme) {
            return scheme.path + '**/*';
          }), {
            nodir: true
          })
          .then(function (files) {
            var tasks = [];

            _.forEach(files, function (file) {
              _.forEach(config.styles, function (style, styleName) {
                tasks.push({
                  style: style,
                  src: file,
                  dist: penrose.getStylePath(styleName, file)
                });
              });
            });

            return Promise.mapSeries(tasks, function (task) {
              return penrose.createDerivative(task.style, task.src, task.dist);
            });
          })
          .then(function () {
            return multiGlob(_.map(config.schemes, function (scheme) {
              return scheme.path + 'styles/**/*';
            }), {
              nodir: true
            });
          });
      };

      var expected = [
        config.schemes.public.path + 'styles/small/' + config.schemes.public.path + 'The_Earth_seen_from_Apollo_17.jpg'
      ];

      return assert.eventually.deepEqual(actual(), expected);
    });
  });

  describe('createMathFile', function () {
    it('Should create math files', function () {
      var math = [{
        data: 'E = mc^2',
        format: 'tex'
      }];

      var tasks = [];
      var expected = [];

      _.forEach(math, function (value) {
        var outputFormat = 'svg';
        var task = {
          input: value.data,
          inputFormat: value.format,
          outputFormat: outputFormat
        };
        var filename = penrose.getMathFilename(task);
        task.output = penrose.getMathPath(outputFormat, filename);

        tasks.push(task);

        expected.push(config.schemes.public.path + 'math/svg/' + filename);
      });

      var actual = function () {
        return Promise.mapSeries(tasks, function (task) {
            return penrose.createMathFile(task);
          })
          .then(function () {
            return multiGlob(_.map(config.schemes, function (scheme) {
              return scheme.path + 'math/**/*';
            }), {
              nodir: true
            });
          });
      };

      return assert.eventually.deepEqual(actual(), expected);
    });
  });
});
