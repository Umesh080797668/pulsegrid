import { Module } from '@nestjs/common';
import { GraphQLModule as ApolloGraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { FlowResolver, EventResolver, PatternResolver, WorkspaceResolver } from './resolvers';
import { DataLoaders } from './dataloaders';

@Module({
  imports: [
    ApolloGraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true,
      playground: process.env.NODE_ENV !== 'production',
      context: async ({ req }) => {
        // Initialize dataloaders for this request
        // In a real app, inject the database connection here
        const dataloaders = new DataLoaders(req.db);
        return { dataloaders, req };
      },
    }),
  ],
  providers: [FlowResolver, EventResolver, PatternResolver, WorkspaceResolver],
  exports: [ApolloGraphQLModule],
})
export class GraphqlModule {}
