const { ApolloServer } = require('@apollo/server')
const { print } = require('graphql');
const { startStandaloneServer } = require('@apollo/server/standalone')
const jwt = require('jsonwebtoken')
const mongoose = require('mongoose')
const { v1: uuid } = require('uuid')
const Author = require('./models/author')
const Book = require('./models/book')
const User = require('./models/user')
const { GraphQLError } = require('graphql')
mongoose.set('strictQuery', false)

require('dotenv').config()
const MONGODB_URI = process.env.MONGODB_URI
console.log('connecting to', MONGODB_URI)
mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('connected to MongoDB')
  })
  .catch((error) => {
    console.log('error connection to MongoDB:', error.message)
  })

const typeDefs = `

  type User {
    username: String!
    favoriteGenre: String!
    id: ID!
  }

  type Token {
    value: String!
  }

  type Query {
    bookCount: Int!
    authorCount: Int!
    allBooks(author: String, genre: String): [Book]!
    allAuthors: [AuthorsResume]!
    me: User
  }

  type Author {
    name: String!
    born: Int
    _id: ID!
  }

  type Book {
    title: String!
    published: Int!
    author: Author!
    genres: [String]!
    _id: ID!
  }

  type AuthorsResume {
    name: String!
    bookCount: Int
    born: Int
    _id: ID!
  }

  type Mutation {
    addBook(
        title: String!
        published: Int!
        author: String!
        genres: [String]!
    ): Book

    editAuthor(
        name: String!
        setBornTo: Int!
    ): Author

    createUser(
      username: String!
      favoriteGenre: String!
    ): User
    login(
      username: String!
      password: String!
    ): Token
  }
`

const resolvers = {
  Query: {
    bookCount:async () => Book.collection.countDocuments(),
    authorCount:async () => Author.collection.countDocuments(),
    allBooks:async  (root, args) =>{
      if (!args.author && !args.genre) {
        return await Book.find({}).populate('author');
      }
      if(args.author && !args.genre){
        const currAuthor = await Author.find({name: args.author})

        return await Book.find({ author: currAuthor._id}).populate('author');
      }

      if(!args.author && args.genre){
        return await Book.find({ genre: args.genre}).populate('author');
      }

      if(args.author && args.genre){
        const currAuthor = await Author.find({name: args.author})
        return await Book.find({ author: currAuthor._id, genre: args.genre}).populate('author');
      }
    },
    allAuthors: async (root, args) =>{
      const result = await Book.aggregate([
        {
          $group: {
            _id: "$author", // Agrupar por el campo "author"
            bookCount: { $count: {} } // Contar cuántos libros tiene cada autor
          }
        },
        {
          $lookup: {
            from: "authors", // Colección de autores
            localField: "_id", // El campo _id en el grupo (el ObjectId del autor)
            foreignField: "_id", // El campo _id en la colección de autores
            as: "authorDetails" // Detalles del autor en el resultado
          }
        },
        {
          $unwind: "$authorDetails" // Convertir el array de autor en un objeto
        },
        {
          $project: {
            _id: 1, // No mostrar el _id del autor
            name: "$authorDetails.name", // Mostrar el nombre del autor
            born: "$authorDetails.born", // Mostrar el nombre del autor
            bookCount: 1 // Mostrar el total de libros
          }
        }
      ])
      return result
    },
    me: (root, args, context) => {
      return context.currentUser
    }
},
Mutation: {
    createUser: async (root, args) => {
      const user = new User({ username: args.username })

      return user.save()
        .catch(error => {
          throw new GraphQLError('Creating the user failed', {
            extensions: {
              code: 'BAD_USER_INPUT',
              invalidArgs: args.username,
              error
            }
          })
        })
    },
    login: async (root, args) => {
      const user = await User.findOne({ username: args.username })
  
      if ( !user || args.password !== 'secret' ) {
        throw new GraphQLError('wrong credentials', {
          extensions: {
            code: 'BAD_USER_INPUT'
          }
        })        
      }
  
      const userForToken = {
        username: user.username,
        id: user._id,
      }
  
      return { value: jwt.sign(userForToken, process.env.JWT_SECRET) }
    },
    addBook: async (root, args, context) => {
      const currentUser = context.currentUser
      if (!currentUser) {
        throw new GraphQLError('not authenticated', {
          extensions: {
            code: 'BAD_USER_INPUT',
          }
        })
      }
      let author = await Author.findOne({ name: args.author })
      if(!author){
        author = new Author({ name:args.author })
      }
      try {
        await author.save()
      } catch (error) {
        if (error.name === 'ValidationError') {
          throw new GraphQLError(`Saving author failed ${error}`, {
            extensions: {
              code: 'BAD_AUTHOR_INPUT',
              invalidArgs: args.author,
              error
            }
          })
        }
      }
      const book = new Book({ ...args, author: author._id})
      try {
        await book.save()
      } catch (error) {
        if (error.name === 'ValidationError') {
          throw new GraphQLError(`Saving book failed ${error}`, {
            extensions: {
              code: 'BAD_BOOK_INPUT',
              invalidArgs: args.title,
              error
            }
          })
        }
      }

      const populatedBook = await book.populate('author');
      return populatedBook
    },
    editAuthor:async (root, args, context) =>{
      const currentUser = context.currentUser
      if (!currentUser) {
        throw new GraphQLError('not authenticated', {
          extensions: {
            code: 'BAD_USER_INPUT',
          }
        })
      }
      const author = await Author.findOne({ name: args.name })
      author.born = args.setBornTo
      try {
        await author.save()
      } catch (error) {
        throw new GraphQLError('Saving born year failed', {
          extensions: {
            code: 'BAD_USER_INPUT',
            invalidArgs: args.name,
            error
          }
        })
      }

      return author
    }
}
}


const server = new ApolloServer({
  typeDefs,
  resolvers
})

startStandaloneServer(server, {
  listen: { port: 4000 },
  context: async ({ req, res }) => {
    console.log(req.headers)
    const auth = req ? req.headers.authorization : null
    if (auth && auth.startsWith('Bearer ')) {
      const decodedToken = jwt.verify(
        auth.substring(7), process.env.JWT_SECRET
      )
      const currentUser = await User
        .findById(decodedToken.id)
      return { currentUser }
    }
  },
}).then(({ url }) => {
  console.log(`Server ready at ${url}`)
})