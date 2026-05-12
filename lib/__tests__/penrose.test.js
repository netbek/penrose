import _ from 'lodash';
import Promise from 'bluebird';
import fs from 'fs-extra';
import {glob} from 'glob';
import path from 'path';
import {describe, expect, test} from 'vitest';
import {Penrose} from '../penrose';

const dir = import.meta.dirname;

describe('Penrose', () => {
  const config = {
    schemes: {
      public: {
        path: path.join(dir, 'data/files') + path.sep
      }
    },
    styles: {
      small: {
        actions: [
          {
            name: 'resize',
            width: 480
          }
        ],
        quality: 75
      }
    }
  };

  const penrose = new Penrose(config);

  describe('resolvePath', () => {
    test('Should return expected path if URI has scheme', () => {
      const actual = penrose.resolvePath('public://dir/file.jpg');
      const expected = config.schemes.public.path + 'dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should return expected path if URI has no scheme', () => {
      const actual = penrose.resolvePath('dir/file.jpg');
      const expected = 'dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should throw error if URI has unsupported scheme', () => {
      expect(() => penrose.resolvePath('http://dir/file.jpg')).toThrowError(
        'Scheme `http` not supported'
      );
    });
  });

  describe('getScheme', () => {
    test('Should return expected scheme if URI has scheme', () => {
      const actual = penrose.getScheme('public://dir/file.jpg');
      const expected = 'public';

      expect(actual).toEqual(expected);
    });

    test('Should return undefined scheme if URI has no scheme', () => {
      const actual = penrose.getScheme('dir/file.jpg');
      const expected = undefined;

      expect(actual).toEqual(expected);
    });
  });

  describe('getTarget', () => {
    test('Should return expected target if URI has scheme', () => {
      const actual = penrose.getTarget('public://dir/file.jpg');
      const expected = 'dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should return expected target if URI has no scheme', () => {
      const actual = penrose.getTarget('dir/file.jpg');
      const expected = 'dir/file.jpg';

      expect(actual).toEqual(expected);
    });
  });

  describe('getURL', () => {
    test('Should return expected URL if URI has scheme', () => {
      const actual = penrose.getURL('public://dir/file.jpg');
      const expected = '/' + config.schemes.public.path + 'dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should return expected URL if URI has no scheme', () => {
      const actual = penrose.getURL('dir/file.jpg');
      const expected = 'dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should return expected URL if URI has unsupported scheme', () => {
      const actual = penrose.getURL('http://dir/file.jpg');
      const expected = 'http://dir/file.jpg';

      expect(actual).toEqual(expected);
    });
  });

  describe('getStylePath', () => {
    test('Should return expected path if URI has scheme', () => {
      const actual = penrose.getStylePath('small', 'private://dir/file.jpg');
      const expected = 'private://styles/small/dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should return expected path if URI has no scheme', () => {
      const actual = penrose.getStylePath('small', 'dir/file.jpg');
      const expected = 'public://styles/small/dir/file.jpg';

      expect(actual).toEqual(expected);
    });
  });

  describe('getStyleURL', () => {
    test('Should return expected URL if URI has scheme', () => {
      const actual = penrose.getStyleURL('small', 'public://dir/file.jpg');
      const expected =
        '/' + config.schemes.public.path + 'styles/small/dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should return expected URL if URI has no scheme', () => {
      const actual = penrose.getStyleURL('small', 'dir/file.jpg');
      const expected =
        '/' + config.schemes.public.path + 'styles/small/dir/file.jpg';

      expect(actual).toEqual(expected);
    });

    test('Should throw error if URI has unsupported scheme', () => {
      expect(() =>
        penrose.getStyleURL('small', 'http://dir/file.jpg')
      ).toThrowError('Scheme `http` not supported');
    });
  });

  describe('createDerivative', () => {
    test('Should create derivative images', async () => {
      await fs.remove(path.join(dir, 'data/files/styles'));

      const files = await glob(
        _.map(config.schemes, function (scheme) {
          return scheme.path + '**/*';
        }),
        {
          nodir: true
        }
      );

      const tasks = [];

      _.forEach(files, function (file) {
        _.forEach(config.styles, function (style, styleName) {
          tasks.push({
            style: style,
            src: file,
            dist: penrose.getStylePath(styleName, file)
          });
        });
      });

      await Promise.mapSeries(tasks, function (task) {
        return penrose.createDerivative(task.style, task.src, task.dist);
      });

      const actual = await glob(
        _.map(config.schemes, function (scheme) {
          return scheme.path + 'styles/**/*';
        }),
        {
          nodir: true
        }
      );

      const expected = [
        path.join(
          config.schemes.public.path,
          'styles/small',
          config.schemes.public.path,
          'The_Earth_seen_from_Apollo_17.jpg'
        )
      ];

      expect(actual).toEqual(expected);

      await fs.remove(path.join(dir, 'data/files/styles'));
    });
  });
});
