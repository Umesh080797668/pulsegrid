import { Module, Inject } from '@nestjs/common';
import { GraphQLModule as ApolloGraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ClientGrpc } from '@nestjs/microservices';
import { FlowResolver, EventResolver, PatternResolver, WorkspaceResolver } from './resolvers';
import { DataLoaders } from './dataloaders';

@Module({
  imports: [
    ApolloGraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: process.env.NODE_ENV !== 'production',
      context: async ({ req }: any) => {
        // DataLoaders will be injected by resolvers via constructor dependency injection
        // This context factory ensures proper module initialization
        return { req };
      },
    }),
  ],
  providers: [FlowResolver, EventResolver, PatternResolver, WorkspaceResolver],
  exports: [ApolloGraphQLModule],
})
export class GraphqlModule {}
