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
    allBooks: [Book]!
    findBooksByGenre(genre: String): [Book]!
    findBooksByAuthor(author: String): [Book]!
    allAuthors: [AuthorsResume]!
    allAuthors2: [AuthorsResume2]!
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

  type AuthorsResume2 {
    name: String!
    bookCount: Int
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

  type Subscription {
    bookAdded: Book!
  }  
`

module.exports= typeDefs