import { Module } from '@nestjs/common';
import { GraphQLModule as ApolloGraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { FlowResolver, EventResolver, PatternResolver, WorkspaceResolver } from './resolvers';
import { PubSub } from 'graphql-subscriptions';

const pubSub = new PubSub();

@Module({
  imports: [
    ApolloGraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: process.env.NODE_ENV !== 'production',
      installSubscriptionHandlers: true,
      context: async ({ req }: any) => {
        // DataLoaders will be injected by resolvers via constructor dependency injection
        // This context factory ensures proper module initialization
        return { req, pubSub };
      },
    }),
  ],
  providers: [
    FlowResolver,
    EventResolver,
    PatternResolver,
    WorkspaceResolver,
    {
      provide: 'PUB_SUB',
      useValue: pubSub,
    },
  ],
  exports: [ApolloGraphQLModule, 'PUB_SUB'],
})
export class GraphqlModule {}
