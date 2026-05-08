import OpenAI from "openai"
const OPENAI_API_KEY =''
const client = new OpenAI({
  apiKey: OPENAI_API_KEY, // This is the default and can be omitted
});


console.log('oi',response.output_text);


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
Once you get the observations, Return the AI response based on START propmt and observations


Available tools
- function getWeatherDetails(city:string):string
getWeatherDetails is a function which takes the city name as input and return the temperature in celcisus

START
{type:"user", "user":"What is the temperature of Delhi?"}
{type:"plan", "plan":"call  the getWeatherDetails with input 'Delhi'"}
{type:"action", "function":"getWeatherDetails", input:"Delhi"}
{type:"observation", "observation":"10°C"}
{type:"output", "output":"The temperature of Delhi is 10°C"}

`

async function chat() {
    const result = await client.chat.completions.create({
      model:'gpt-4',
      messages:[
        {role:'user',content:'Hye what is the weather of delhi'},
        {role:'system',content:SYSTEM_PROMPT}
      ]
    })
    console.log(result.choices[0].message.content);
}

chat()
