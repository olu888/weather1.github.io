document.addEventListener('DOMContentLoaded', async () => {
  let favoriteDayIndex = null;
  let weatherData = null;
  let currentCity = 'Towson';

  // Main initialization
  async function init() {
    setupSearchBar();
    await fetchWeatherData();
    setupFavoriteDaySelection();
    setupAIButton();
  }

  // Set up search bar functionality
  function setupSearchBar() {
    const header = document.querySelector('header');
    
    // Create search container
    const searchContainer = document.createElement('div');
    searchContainer.className = 'search-container';
    searchContainer.innerHTML = `
      <input type="text" id="city-search" placeholder="Search US cities..." value="${currentCity}">
      <div id="search-results" class="search-results"></div>
    `;
    header.insertBefore(searchContainer, header.firstChild);

    const searchInput = document.getElementById('city-search');
    const searchResults = document.getElementById('search-results');

    // Debounce search input
    let debounceTimer;
    searchInput.addEventListener('input', async () => {
      clearTimeout(debounceTimer);
      const query = searchInput.value.trim();
      
      if (query.length < 2 || query.includes(',')) {
        searchResults.style.display = 'none';
        return;
      }

      debounceTimer = setTimeout(async () => {
        try {
          const cities = await searchCities(query);
          displaySearchResults(cities);
        } catch (error) {
          console.error('Search error:', error);
          searchResults.style.display = 'none';
        }
      }, 300);
    });

    // Handle city selection
    function displaySearchResults(cities) {
      searchResults.innerHTML = '';
      
      if (!cities || cities.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'search-result';
        noResults.textContent = 'No cities found';
        searchResults.appendChild(noResults);
      } else {
        cities.forEach(city => {
          if (!city.name || !city.country) return;
          
          const resultItem = document.createElement('div');
          resultItem.className = 'search-result';
          resultItem.textContent = `${city.name}, ${city.country}`;
          resultItem.addEventListener('click', () => {
            currentCity = `${city.name}, ${city.country}`;
            searchInput.value = currentCity;
            searchResults.style.display = 'none';
            fetchWeatherData();
          });
          searchResults.appendChild(resultItem);
        });
      }
      
      searchResults.style.display = cities?.length ? 'block' : 'none';
    }

    // Close results when clicking outside
    document.addEventListener('click', (e) => {
      if (!searchContainer.contains(e.target)) {
        searchResults.style.display = 'none';
      }
    });
  }

  // Fetch city search results
  async function searchCities(query) {
    try {
      const response = await fetch(`/api/cities?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error('Failed to fetch cities');
      const data = await response.json();
      return Array.isArray(data) ? data : [];
    } catch (error) {
      console.error('City search error:', error);
      return [];
    }
  }

  // Fetch weather data for current city
  async function fetchWeatherData() {
    try {
      const response = await fetch(`/api/weather?city=${encodeURIComponent(currentCity)}`);
      if (!response.ok) {
        throw new Error(`Server returned ${response.status}`);
      }
      weatherData = await response.json();
      
      if (weatherData.error) {
        throw new Error(weatherData.message || weatherData.error);
      }
      
      if (!weatherData.current || !weatherData.hourly || !weatherData.daily) {
        throw new Error('Invalid weather data format');
      }
      
      updateWeatherUI(weatherData);
      updateCityDisplay();
    } catch (error) {
      console.error('Error fetching weather:', error);
      showErrorPopup(error.message || 'Failed to load weather data. Please try a different city.');
    }
  }

  // Update weather display
  function updateWeatherUI(data) {
    if (!data.current) return;
    
    // Current weather
    document.getElementById('temp').textContent = `${Math.round(data.current.temp)}°F`;
    document.getElementById('highlow').textContent = `H:${Math.round(data.current.high)}° L:${Math.round(data.current.low)}°`;
    document.getElementById('wind').textContent = `${data.current.wind} mph`;
    document.getElementById('humidity').textContent = `${data.current.humidity}%`;
    
    const weatherIcon = document.getElementById('weather-icon');
    weatherIcon.src = `images/${data.current.icon || 'cloudy.png'}`;
    weatherIcon.alt = data.current.condition || 'Weather icon';

    // Hourly forecast
    const hourlyContainer = document.querySelector('.hourly-forecast');
    if (data.hourly && Array.isArray(data.hourly)) {
      hourlyContainer.innerHTML = data.hourly.map(hour => `
        <div class="hour">
          <span class="hour-time">${hour.time || '--:--'}</span>
          <img src="images/${hour.icon || 'cloudy.png'}" alt="${hour.condition || ''}">
          <span class="hour-temp">${hour.temp || '--'}°</span>
        </div>
      `).join('');
    }

    // Daily forecast
    const dailyContainer = document.querySelector('.daily-forecast');
    if (data.daily && Array.isArray(data.daily)) {
      dailyContainer.innerHTML = data.daily.map((day, index) => `
        <div class="day ${index === favoriteDayIndex ? 'favorite-day' : ''}" data-index="${index}">
          <span class="day-name">${index === 0 ? 'Today' : day.day || 'Day'}</span>
          <img src="images/${day.icon || 'cloudy.png'}" alt="${day.condition || ''}">
          <span class="day-temp">H:${Math.round(day.high) || '--'}° L:${Math.round(day.low) || '--'}°</span>
        </div>
      `).join('');
    }
  }

  // Update city name display
  function updateCityDisplay() {
    if (!weatherData?.current?.city) return;
    
    let cityDisplay = document.getElementById('city-display');
    let city = document.getElementById('city');
    if (!cityDisplay) {
      cityDisplay = document.createElement('div');
      cityDisplay.id = 'city-display';
      document.querySelector('.weather-main').prepend(cityDisplay);
    }
    cityDisplay.textContent = weatherData.current.city;
    city.textContent = weatherData.current.city;
  }

  // Set up favorite day selection
  function setupFavoriteDaySelection() {
    const dailyContainer = document.querySelector('.daily-forecast');
    
    dailyContainer.addEventListener('click', (e) => {
      const dayElement = e.target.closest('.day');
      if (!dayElement) return;
      
      const newIndex = parseInt(dayElement.dataset.index);
      if (isNaN(newIndex)) return;
      
      favoriteDayIndex = favoriteDayIndex === newIndex ? null : newIndex;
      
      document.querySelectorAll('.day').forEach((day, index) => {
        day.classList.toggle('favorite-day', index === favoriteDayIndex);
      });
    });
  }

  // Set up AI button
  function setupAIButton() {
    const aiButton = document.createElement('button');
    aiButton.id = 'ai-button';
    aiButton.innerHTML = `
      <span class="button-text">Get AI Tips</span>
      <span class="spinner"></span>
    `;
    document.querySelector('header').appendChild(aiButton);
  
    aiButton.addEventListener('click', async () => {
      try {
        if (!weatherData) await fetchWeatherData();
        
        aiButton.classList.add('loading');
        aiButton.querySelector('.button-text').textContent = 'Thinking...';
        
        const tips = await getAIWeatherTips(weatherData, favoriteDayIndex);
        showAITipsPopup(tips);
      } catch (error) {
        showErrorPopup("Couldn't connect to the weather assistant. Please try again.");
      } finally {
        aiButton.classList.remove('loading');
        aiButton.querySelector('.button-text').textContent = 'Get AI Tips';
      }
    });
  }

  // Get AI weather tips
  async function getAIWeatherTips(weatherData, favoriteDayIndex) {
    try {
      const response = await fetch('/api/ai-weather', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          weatherData: weatherData || null,
          favoriteDay: favoriteDayIndex !== null && !isNaN(favoriteDayIndex) ? favoriteDayIndex : null
        })
      });
      
      if (!response.ok) throw new Error('Failed to get AI tips');
      
      const data = await response.json();
      return data.aiResponse || "Couldn't get weather tips right now.";
    } catch (error) {
      console.error('AI fetch error:', error);
      return "Weather assistant unavailable. Please try again later.";
    }
  }

  // Show AI tips popup
  function showAITipsPopup(message) {
    const popup = document.createElement('div');
    popup.className = 'ai-popup';
    popup.innerHTML = `
      <div class="ai-popup-content">
        <h3>🌦️ Weather Assistant</h3>
        <p>${(message || '').replace(/\n/g, '<br>')}</p>
        <button class="close-btn">Close</button>
      </div>
    `;
    
    document.body.appendChild(popup);
    
    popup.querySelector('.close-btn').addEventListener('click', () => {
      popup.remove();
    });
  }

  // Show error popup
  function showErrorPopup(message) {
    const popup = document.createElement('div');
    popup.className = 'ai-popup';
    popup.innerHTML = `
      <div class="ai-popup-content">
        <h3>⚠️ Error</h3>
        <p>${message || 'An unknown error occurred'}</p>
        <button class="close-btn">Close</button>
      </div>
    `;
    
    document.body.appendChild(popup);
    
    popup.querySelector('.close-btn