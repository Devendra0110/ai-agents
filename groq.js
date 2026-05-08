const GROK_API_KEY = ''
import Groq from 'groq-sdk';

const client = new Groq({
  apiKey: GROK_API_KEY, // This is the default and can be omitted
});



function getWeatherDetails(city=''){
  if(city.toLowerCase() == 'delhi') return '10°C'
  if(city.toLowerCase() == 'chandigarh') return '12°C'
  if(city.toLowerCase() == 'bangalore') return '14°C'
  if(city.toLowerCase() == 'mohali') return '8°C'
}


const SYSTEM_PROMPT = `
You are an AI Assistant with START, PLAN, ACTION, Observation and Output State.
Wait for the user prompt and first PLAN using available tools.
After Planning, Take the action with appropriate tools and wait for Observation based on Action.
Once you get the observations, Return the AI response based on START prompt and observations


Available tools:
- function getWeatherDetails(city:string):string
getWeatherDetails is a function which takes the city name as input and return the temperature in celcisus

Example:
START
{type:"user", "user":"What is the temperature of mohali?"}
{type:"plan", "plan":"call  the getWeatherDetails with input 'mohali'"}
{type:"action", "function":"getWeatherDetails", input:"mohali"}
{type:"observation", "observation":"20°C"}
{type:"output", "output":"The temperature of mohali is 20°C"}

`

async function chat() {
    const result = await client.chat.completions.create({
        model:'llama-3.1-8b-instant',
        messages:[
            {role:'user', 'content':"Hey, What is the weather of mohali"},
            {role:'system', content:SYSTEM_PROMPT}
        ]
    })
    console.log(result.choices[0].message.content);
}

chat()
