import { runCliMap } from 'open-web-cli';
import { cliMap } from './cli-map';

runCliMap(cliMap).then((exitCode) => {
  process.exitCode = exitCode;
});
