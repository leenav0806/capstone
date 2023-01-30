import { TodoItem } from '../models/TodoItem';
//import { TodoUpdate } from  '../models/TodoUpdate'
import { CreateTodoRequest } from '../requests/CreateTodoRequest';
import { UpdateTodoRequest } from '../requests/UpdateTodoRequest';
import { createLogger } from '../utils/logger'
const uuid = require('uuid/v4')
import * as AWS from 'aws-sdk'
import { SNSAccess } from './snsAccess';


const logger = createLogger('todosDataAccess');

const sns = new AWS.SNS;
const snsArn = process.env.SNS_ARN
const topic = process.env.TOPIC_NAME



const mySns = new SNSAccess(sns, snsArn, topic)

export class TodosAccess{
    constructor(
        private readonly docClient: AWS.DynamoDB.DocumentClient = new AWS.DynamoDB.DocumentClient(),
        private readonly todosTable = process.env.TODOS_TABLE,
        private readonly userIdIndex = process.env.TODOS_USERID_INDEX,
        private readonly todoIdIndex = process.env.TODOS_TODOID_INDEX,
    ){}

    async getUserTodos(userId: string): Promise<TodoItem[]>{
        logger.info(`Step 1 GetUserTodos.... ${userId}`)
        const result = await this.docClient.query({
            TableName: this.todosTable,
            IndexName: this.userIdIndex,
            KeyConditionExpression: 'userId = :userId',
            ExpressionAttributeValues:{
                ':userId':userId
            }
        }).promise()
        return result.Items as TodoItem[]
    }



    async getUserTodoCount(userId: string): Promise<number>{
      const result = await this.docClient.query({
          TableName: this.todosTable,
          IndexName: this.userIdIndex,
          KeyConditionExpression: 'userId = :userId',
          FilterExpression: 'done = :done',
          ExpressionAttributeValues:{
              ':userId':userId,
              ':done': false
          }
      }).promise()
      return result.Items.length
  }

    async createTodo(request: CreateTodoRequest,userId: string): Promise<TodoItem>{
      logger.info(` Data Access - Step 1 Create To DO for user:  ${userId}`)

        const newId = uuid()
        const item = {} as TodoItem
        item.userId= userId
        item.todoId= newId
        item.createdAt= new Date().toISOString()
        item.name= request.name
        item.dueDate= request.dueDate
        item.done= false
        item.attachmentUrl = ''

        await this.docClient.put({
            TableName: this.todosTable,
            Item: item
        }).promise()
        logger.info(`Step 4 Should have inserted new record:  ${newId}`)
        mySns.publishNewTodoMessage(item.name)
        return item
    }


    async getTodoById(todoId: String): Promise<TodoItem> {
      const result = await this.docClient.query({
        TableName: this.todosTable,
        IndexName: this.todoIdIndex,
        KeyConditionExpression: 'todoId = :todoId',
        ExpressionAttributeValues: {
          ':todoId': todoId,
        },
        ScanIndexForward: false
      }).promise()
  
      const item = result.Items
      return item[0] as TodoItem
    }


 async updateTodo(updatedTodo:UpdateTodoRequest,todoId:string, currentUserId: string){
        await this.docClient.update({
            TableName: this.todosTable,
            Key:{
                todoId: todoId,
		            userId: currentUserId
            },
            UpdateExpression: 'set #namefield = :n, dueDate = :d, done = :done',
            ExpressionAttributeValues: {
                ':n' : updatedTodo.name,
                ':d' : updatedTodo.dueDate,
                ':done' : updatedTodo.done,
                ':userId' : currentUserId,
            },
            ExpressionAttributeNames:{
                "#namefield": "name"
              },
              ConditionExpression: 'userId = :userId',
          }).promise()
          mySns.publishDoneTodoMessage(updatedTodo.name)
    }  
    


    async deleteTodo(todo: TodoItem, currentUserId:string) {	
      const deleteditem = await this.docClient.delete({
            TableName: this.todosTable,
            Key: {
	             userId: todo.userId,
               todoId: todo.todoId
            },
            ConditionExpression:"userId = :currentUserId",
            ExpressionAttributeValues: {
              ":currentUserId": currentUserId
            }   
       }).promise();
       return todo;
    }



    
    async updateTodoUrl(userId: string, todoId: string,  attachmentUrl: string): Promise<void> {
        await this.docClient.update({
          TableName: this.todosTable,
          Key: {
            todoId: todoId,
            userId: userId
          },
          UpdateExpression: 'set attachmentUrl = :attachmentUrl',
          ExpressionAttributeValues: {
            ':attachmentUrl': attachmentUrl,
            ':todoId' : todoId,
            ':userId' : userId,
          },
          ConditionExpression: 'todoId = :todoId and userId = :userId',
          ReturnValues: 'UPDATED_NEW'
        }).promise();
      }

}