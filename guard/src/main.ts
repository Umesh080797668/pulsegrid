import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { GuardModule } from './guard.module';

const logger = new Logger('Guard');

async function bootstrap() {
  const app = await NestFactory.create(GuardModule);

  const port = process.env.PORT || 3002;
  await app.listen(port);

  logger.log(`Guard service listening on port ${port}`);
}

bootstrap().catch((err) => {
  logger.error('Failed to start Guard service', err);
  process.exit(1);
});
