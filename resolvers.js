const { PubSub } = require('graphql-subscriptions')
const pubsub = new PubSub()
const Author = require('./models/author')
const Book = require('./models/book')
const User = require('./models/user')
const { GraphQLError } = require('graphql')
const jwt = require('jsonwebtoken')

const resolvers = {
    Query: {
      bookCount:async () => Book.collection.countDocuments(),
      authorCount:async () => Author.collection.countDocuments(),
      allBooks:async  (root, args) =>{
        return await Book.find({}).populate('author');
        // if(args.author && args.genre){
        //   const currAuthor = await Author.find({name: args.author})
        //   return await Book.find({ author: currAuthor._id, genre: args.genre}).populate('author');
        // }
      },
      findBooksByGenre:async  (root, args) =>{
        if(args.genre=== 'allGenres'){
          return await Book.find({}).populate('author');
        }
        if(args.genre){
          return await Book.find({ genres: args.genre}).populate('author');
        }
  
        return await Book.find({}).populate('author');
      },
      findBooksByAuthor:async  (root, args) =>{
        if(args.author){
          const currAuthor = await Author.find({name: args.author})
  
          return await Book.find({ author: currAuthor._id}).populate('author');
        }
  
        return await Book.find({}).populate('author');
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
        pubsub.publish('BOOK_ADDED', { bookAdded: populatedBook })
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
  },
  Subscription: {
    bookAdded: {
      subscribe: () => pubsub.asyncIterableIterator('BOOK_ADDED')
    },
  },
}

module.exports = resolvers