CREATE SCHEMA Weather;

-- Users table (with notification preferences)
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    session_id VARCHAR(255) UNIQUE,
    email VARCHAR(255) UNIQUE,
    units VARCHAR(10) DEFAULT 'metric',
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Cached locations from OpenWeatherAPI
CREATE TABLE cached_locations (
    location_id INT AUTO_INCREMENT PRIMARY KEY,
    openweather_id VARCHAR(50) UNIQUE,
    city_name VARCHAR(100) NOT NULL,
    country_code VARCHAR(2) NOT NULL,
    latitude DECIMAL(10, 6) NOT NULL,
    longitude DECIMAL(10, 6) NOT NULL,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- User search history
CREATE TABLE user_searches (
    search_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    location_id INT,
    searched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES cached_locations(location_id)
);

-- Cached weather data (expires hourly)
CREATE TABLE cached_weather (
    weather_id INT AUTO_INCREMENT PRIMARY KEY,
    location_id INT,
    expires_at TIMESTAMP NOT NULL,
    current_temp DECIMAL(5, 2) NOT NULL,
    high_temp DECIMAL(5, 2) NOT NULL,
    low_temp DECIMAL(5, 2) NOT NULL,
    weather_condition VARCHAR(50) NOT NULL,
    wind_speed DECIMAL(5, 2) NOT NULL,
    humidity INT NOT NULL,
    uv_index DECIMAL(3, 1),
    precipitation INT,
    hourly_data JSON,
    daily_forecast JSON,  -- 7-day forecast
    FOREIGN KEY (location_id) REFERENCES cached_locations(location_id)
);

-- User events/important dates
CREATE TABLE user_events (
    event_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    event_name VARCHAR(100) NOT NULL,
    event_date DATE NOT NULL,
    location_id INT,
    notify_if_rain BOOLEAN DEFAULT TRUE,
    notify_if_temp_change BOOLEAN DEFAULT TRUE,
    temp_change_threshold DECIMAL(3, 1),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES cached_locations(location_id)
);

/* scrapped ideas, notifications & AI its a web app not a mobile download 
we'd implement this but realistically, nobody is checking their email for weather updates
nor would people want a bunch of texts about a weather change
-- Weather change alerts for events
CREATE TABLE event_weather_alerts (
    alert_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT,
    old_condition VARCHAR(50),
    new_condition VARCHAR(50) NOT NULL,
    old_temp DECIMAL(5, 2),
    new_temp DECIMAL(5, 2),
    triggered_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (event_id) REFERENCES user_events(event_id) ON DELETE CASCADE
);

-- AI customization per user, we'd use this if we could pay for gemini (broke college students lol)
CREATE TABLE ai_preferences (
    preference_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    tone VARCHAR(20) DEFAULT 'friendly',
    detail_level VARCHAR(20) DEFAULT 'medium',
    clothing_recommendations BOOLEAN DEFAULT TRUE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

Table for ai_summaries, once again, we're broke
CREATE TABLE ai_summaries (
    summary_id INT AUTO_INCREMENT PRIMARY KEY,
    location_id INT,
    date DATE NOT NULL,
    summary_text TEXT NOT NULL,
    recommendations TEXT,
    context TEXT,
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (location_id) REFERENCES cached_locations(location_id),
    UNIQUE KEY (location_id, date)
);

-- Notification system
CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    type VARCHAR(20) NOT NULL,
    content TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);
*/

-- Indexes for performance
CREATE INDEX idx_cached_weather_location ON cached_weather(location_id);
CREATE INDEX idx_cached_weather_expiry ON cached_weather(expires_at);
CREATE INDEX idx_event_alerts ON event_weather_alerts(event_id, is_read);