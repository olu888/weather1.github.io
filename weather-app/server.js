require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cities = require('cities.json');

const app = express();
const PORT = process.env.PORT || 3000;
const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY;

// Database configuration
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'Weather',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

// Create connection pool
const pool = mysql.createPool(dbConfig);

// Session store
const sessionStore = new MySQLStore({}, pool);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  key: 'weather_session',
  secret: process.env.SESSION_SECRET || 'your_secret_key',
  store: sessionStore,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 // 1 day
  }
}));

// User tracking middleware
app.use(async (req, res, next) => {
  try {
    if (!req.session.userId) {
      const [result] = await pool.execute(
        'INSERT INTO users (session_id) VALUES (?)',
        [req.sessionID]
      );
      req.session.userId = result.insertId;
    }
    next();
  } catch (error) {
    console.error('User tracking error:', error);
    next();
  }
});

// Weather icon mapping
const weatherIcons = {
  '01d': 'clear.png', '01n': 'clear.png',
  '02d': 'partly-cloudy.png', '02n': 'partly-cloudy.png',
  '03d': 'cloudy.png', '03n': 'cloudy.png',
  '04d': 'cloudy.png', '04n': 'cloudy.png',
  '09d': 'rain.png', '09n': 'rain.png',
  '10d': 'rain.png', '10n': 'rain.png',
  '11d': 'thunderstorm.png', '11n': 'thunderstorm.png',
  '13d': 'snow.png', '13n': 'snow.png',
  '50d': 'mist.png', '50n': 'mist.png'
};

// Safe JSON parse function
function safeJsonParse(str) {
  try {
    return typeof str === 'string' ? JSON.parse(str) : str;
  } catch (e) {
    console.error('JSON parse error:', e);
    return null;
  }
}

// City search endpoint
app.get('/api/cities', (req, res) => {
  try {
    const query = req.query.q ? req.query.q.toLowerCase() : '';
    if (!query || query.length < 2) {
      return res.json([]);
    }

    const results = cities
      .filter(city => 
        city.country === 'US' && 
        city.name.toLowerCase().includes(query)
      )
      .slice(0, 10)
      .map(city => ({
        name: city.name,
        state: city.state,
        country: city.country,
        fullName: `${city.name}, ${city.country}`
      }));

    res.json(results);
  } catch (error) {
    console.error('City search error:', error);
    res.status(500).json({ error: 'Failed to search cities' });
  }
});

// Weather endpoint with caching
app.get('/api/weather', async (req, res) => {
  try {
    let city = req.query.city || 'Towson';
    // Ensure city format is "City,US"
    city = city.includes(',') ? city.split(',')[0].trim() + ',US' : city + ',US';
    const baseCityName = city.split(',')[0].trim();

    // Check cache first
    const [cachedWeather] = await pool.execute(
      `SELECT cw.* FROM cached_weather cw 
      JOIN cached_locations cl ON cw.location_id = cl.location_id 
      WHERE cl.city_name = ? AND cw.expires_at > NOW() 
      ORDER BY cw.expires_at DESC LIMIT 1`,
      [baseCityName]
    );

    if (cachedWeather.length > 0) {
      const weather = cachedWeather[0];
      
      // Track this search
      if (req.session.userId) {
        await trackSearch(req.session.userId, weather.location_id);
      }

      return res.json({
        current: {
          city: city.split(',')[0],
          temp: weather.current_temp,
          high: weather.high_temp,
          low: weather.low_temp,
          wind: weather.wind_speed,
          humidity: weather.humidity,
          condition: weather.weather_condition,
          icon: weatherIcons[weather.weather_condition.toLowerCase().replace(' ', '-')] || 'cloudy.png'
        },
        hourly: safeJsonParse(weather.hourly_data) || [],
        daily: safeJsonParse(weather.daily_forecast) || []
      });
    }

    // Fetch fresh data from API
    const [current, forecast] = await Promise.all([
      axios.get(`https://api.openweathermap.org/data/2.5/weather?q=${city}&units=imperial&appid=${OPENWEATHER_API_KEY}`),
      axios.get(`https://api.openweathermap.org/data/2.5/forecast?q=${city}&units=imperial&appid=${OPENWEATHER_API_KEY}`)
    ]);

    // Process current weather
    const currentWeather = {
      city: city.split(',')[0],
      temp: Math.round(current.data.main.temp),
      high: Math.round(current.data.main.temp_max),
      low: Math.round(current.data.main.temp_min),
      wind: Math.round(current.data.wind.speed),
      humidity: current.data.main.humidity,
      condition: current.data.weather[0].main,
      icon: weatherIcons[current.data.weather[0].icon] || 'cloudy.png'
    };

    // Process hourly forecast
    const hourlyForecast = forecast.data.list.slice(0, 6).map(hour => ({
      time: new Date(hour.dt * 1000).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        hour12: true 
      }).replace(':00', ''),
      temp: Math.round(hour.main.temp),
      condition: hour.weather[0].main,
      icon: weatherIcons[hour.weather[0].icon] || 'cloudy.png'
    }));

    // Process daily forecast
    const dailyData = forecast.data.list.reduce((acc, item) => {
      const date = new Date(item.dt * 1000);
      const dayKey = date.toLocaleDateString('en-US', { weekday: 'long' });
      
      if (!acc[dayKey]) {
        acc[dayKey] = {
          day: dayKey,
          date: date,
          high: -Infinity,
          low: Infinity,
          condition: item.weather[0].main,
          icon: weatherIcons[item.weather[0].icon] || 'cloudy.png'
        };
      }
      
      acc[dayKey].high = Math.max(acc[dayKey].high, item.main.temp_max);
      acc[dayKey].low = Math.min(acc[dayKey].low, item.main.temp_min);
      
      return acc;
    }, {});

    const dailyForecast = Object.values(dailyData).slice(0, 7);

    // Cache the new data
    const locationId = await cacheLocation(current.data);
    await cacheWeatherData(
      locationId,
      current.data,
      hourlyForecast,
      dailyForecast
    );

    // Track this search
    if (req.session.userId) {
      await trackSearch(req.session.userId, locationId);
    }

    res.json({
      current: currentWeather,
      hourly: hourlyForecast,
      daily: dailyForecast
    });

  } catch (error) {
    console.error('Weather API error:', error);
    let errorMessage = 'Failed to fetch weather data';
    if (error.response) {
      errorMessage = error.response.data.message || errorMessage;
    }
    res.status(500).json({ 
      error: errorMessage,
      message: `Could not find weather for ${req.query.city || 'default location'}`
    });
  }
});

// AI Weather Tips endpoint
app.post('/api/ai-weather', async (req, res) => {
  try {
    const { weatherData, favoriteDay } = req.body;
    
    if (!weatherData) {
      throw new Error('No weather data provided');
    }
    
    let tips = `Weather for ${weatherData.current?.city || 'unknown location'}:\n`;
    tips += `Current: ${weatherData.current?.condition || 'unknown'}, ${weatherData.current?.temp || '--'}°F\n`;
    tips += `Wind: ${weatherData.current?.wind || '--'} mph, Humidity: ${weatherData.current?.humidity || '--'}%\n\n`;
    
    if (favoriteDay !== null && weatherData.daily?.[favoriteDay]) {
      const day = weatherData.daily[favoriteDay];
      tips += `Your favorite day (${day.day}) forecast:\n`;
      tips += `High: ${Math.round(day.high)}°F, Low: ${Math.round(day.low)}°F\n`;
      tips += `Conditions: ${day.condition}\n\n`;
      
      if (day.condition.toLowerCase().includes('rain')) {
        tips += `🌧️ Don't forget your umbrella on ${day.day}!`;
      } else if (day.high > 80) {
        tips += `☀️ ${day.day} will be hot - stay hydrated!`;
      } else if (day.low < 32) {
        tips += `❄️ ${day.day} will be freezing - bundle up!`;
      } else {
        tips += `🌤️ ${day.day} looks like a great day to be outside!`;
      }
    } else {
      tips += "No favorite day selected. Click on a day in the forecast to get specific tips!";
    }
    
    res.json({ aiResponse: tips });
  } catch (error) {
    console.error('AI weather error:', error);
    res.status(500).json({ 
      error: 'Failed to generate weather tips',
      message: error.message
    });
  }
});

// Helper functions
async function cacheLocation(weatherData) {
  try {
    const [existing] = await pool.execute(
      'SELECT location_id FROM cached_locations WHERE openweather_id = ?',
      [weatherData.id.toString()]
    );
    
    if (existing.length > 0) return existing[0].location_id;

    const [result] = await pool.execute(
      'INSERT INTO cached_locations (openweather_id, city_name, country_code, latitude, longitude) VALUES (?, ?, ?, ?, ?)',
      [
        weatherData.id.toString(),
        weatherData.name,
        weatherData.sys.country,
        weatherData.coord.lat,
        weatherData.coord.lon
      ]
    );
    return result.insertId;
  } catch (error) {
    console.error('Location caching error:', error);
    throw error;
  }
}

async function cacheWeatherData(locationId, currentData, hourlyForecast, dailyForecast) {
  try {
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 1);

    await pool.execute(
      'INSERT INTO cached_weather (location_id, expires_at, current_temp, high_temp, low_temp, weather_condition, wind_speed, humidity, hourly_data, daily_forecast) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        locationId,
        expiresAt,
        currentData.main.temp,
        currentData.main.temp_max,
        currentData.main.temp_min,
        currentData.weather[0].main,
        currentData.wind.speed,
        currentData.main.humidity,
        JSON.stringify(hourlyForecast),
        JSON.stringify(dailyForecast)
      ]
    );
  } catch (error) {
    console.error('Weather caching error:', error);
    throw error;
  }
}

async function trackSearch(userId, locationId) {
  try {
    await pool.execute(
      'INSERT INTO user_searches (user_id, location_id) VALUES (?, ?)',
      [userId, locationId]
    );
  } catch (error) {
    console.error('Search tracking error:', error);
  }
}

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});