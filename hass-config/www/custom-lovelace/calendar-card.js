class CalendarCard extends HTMLElement {

  
  
  /**
   * called by hass - creates card, sets up any conmfig settings, and generates card
   * @param  {[type]} hass [description]
   * @return {[type]}      [description]
   */
  set hass(hass) {
    
    // if we don't have the card yet then create it
    if (!this.content) {
      const card = document.createElement('ha-card');
      card.header = this.config.title;
      this.content = document.createElement('div');
      this.content.className = 'calendar-card';
      card.appendChild(this.content);
      this.appendChild(card);
    }

    // save an instance of hass for later
    this._hass = hass;
    this.wait();
	}
	
	  wait() {
    if(typeof(moment) == "undefined") {
      setTimeout(() => this.wait(), 250);
      return;
    }

	moment.locale(this._hass.language);
	
    // save css rules
    this.cssRules = `
      <style>
        .calendar-card {
          display: flex;
          padding: 0 16px 4px;
          flex-direction: column;
        }
        .day-wrapper {
          border-bottom: 1px solid;
        }
        .day-wrapper:last-child {
          border-bottom: none;
        }
        .day-wrapper .calendar-day {
          display: flex;
          flex-direction: row;
          width: 100%;
        }
        .day-wrapper .date {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: top;
          flex: 0 0 40px;
          padding-top: 10px;
        }
        .day-wrapper .events {
          flex: 1 1 auto;
        }
        .day-wrapper .summary {
		  font-size: ${this.config.textSizeSummary}%;
		  cursor: pointer;
        }
        .day-wrapper .event-wrapper {
          margin-left: 10px;
          padding-top: 10px;
        }
        .day-wrapper .event-wrapper:last-child {
          padding-bottom: 10px;
        }
        .day-wrapper .event {
          flex: 0 1 auto;
          display: flex;
          flex-direction: column;
        }
        .day-wrapper .info {
          display: flex;
          width: 100%;
          justify-content: space-between;
          flex-direction: row;
        }
        .day-wrapper .time {
          color: var(--primary-color);
		  font-size: ${this.config.textSizeTime}%;
        }
        .day-wrapper hr.now {
            border-style: solid;
            border-color: var(--primary-color);
            border-width: 1px 0 0 0;
            margin-top: -8px;
            margin-left: 5px;
			width: 100%;
        }
        .day-wrapper ha-icon {
		  height: 16px;
          width: 16px;
          color: ${this.config.mapIconColor};
        }
        .day-wrapper ha-icon.now {
            height: 12px;
            width: 12px;
			color: var(--paper-item-icon-color, #44739e);
        } 
        .day-wrapper ha-icon.current {
            height: 12px;
            width: 12px;
			color: rgb(223, 76, 30);
        }       		
      </style>
    `;

    // update card with calendars
    this
      .getAllEvents(this.config.entities)
      .then(events => this.updateHtmlIfNecessary(events))
      .catch(error => console.log('error', error));
  }

  /**
   * [getAllEvents description]
   * @param  {[type]} entities [description]
   * @return {[type]}          [description]
   */
  async getAllEvents(entities) {

    // don't update if it's only been 15 min
    if(this.lastUpdate && moment().diff(this.lastUpdate, 'minutes') <= 15) {
      return this.events;
    }
    
    // create url params
    const dateFormat = "YYYY-MM-DDTHH:mm:ss";
    const today = moment().startOf('day');
    const start = today.format(dateFormat);
    const end = today.add(this.config.numberOfDays, 'days').format(dateFormat);

    // generate urls for calendars and get each calendar data
	const urls = entities.map(entity => `calendars/${entity.entity}?start=${start}Z&end=${end}Z`);	
    let allResults = await this.getAllUrls(urls);

	// creating CalendarEvents and passing color settings for different calendars
	let events= [].concat.apply([], (allResults.map((result,i) => {
			return result.map(r => {
				return(new CalendarEvent(r,this.config.entities[i].color===undefined ? 'var(--primary-text-color)' :this.config.entities[i].color )
				)
			});
		})))

    // show progress bar if turned on
    if (this.config.showProgressBar && events.length > 0 && moment().format('DD') === moment(events[0].startDateTime).format('DD')) {
		//checks if any event is running, if no, show the default progress bar
		let noEventRunning=true;	
		events.forEach(function(element, i) {
		if(!element.isFullDayEvent && moment()>=moment(element.startDateTime) && moment()<=moment(element.endDateTime))
			noEventRunning=false;
		});
		//show standard progress bar
		if(noEventRunning || !this.config.showCurrentProgress) {
			let now = {startDateTime: moment().format(), type: 'now'}
			 events.push(now);}
	}

    // sort events by date starting with soonest
    events.sort((a, b) => new Date(a.startDateTime) - new Date(b.startDateTime));

    // see if anything changed since last time, save events, and update last time we updated
    const isSomethingChanged = this.isSomethingChanged(events);
    this.events = events;
    this.lastUpdate = moment();
    return { events, isSomethingChanged };
    
  }

  /**
   * given a list of urls get the data from them
   * @param  {Array<string>} urls
   * @return {Array<any>}
   */
  async getAllUrls(urls) {
    try {
      return await Promise.all(urls.map(url => this._hass.callApi('get', url)));
    } catch (error) {
      throw error;
    }
  }

  /**
   * updates the entire card if we need to
   * @param  {[type]} eventList [description]
   * @return {[type]}           [description]
   */
  updateHtmlIfNecessary(eventList) {
    if(!eventList.isSomethingChanged) return;

    // save CSS rules then group events by day
    this.content.innerHTML = this.cssRules;
    const events = eventList.events;
    const groupedEventsPerDay = this.groupBy(events, event => moment(event.startDateTime).format('YYYY-MM-DD'));

    // for each group event create a UI 'day'
    groupedEventsPerDay.forEach((events, day) => {
      const eventStateCardContentElement = document.createElement('div');
      eventStateCardContentElement.classList.add('day-wrapper');
      eventStateCardContentElement.innerHTML = this.getDayHtml(day, events);
      this.content.append(eventStateCardContentElement);
    });
  }

  /**
   * check if event is today
   * @param {*} event 
   * @return {Boolean} 
   */	
  isEventToday(event){
	return moment(event.startDateTime).isSame(moment(), 'day') ?  true :  false;
  }
 
  /**
   * check if event is tomorrow
   * @param {*} event 
   * @return {Boolean} 
   */	 
  isEventTomorrow(event){
	return moment(event.startDateTime).isSame(moment().add(1,'day'), 'day') ?  true :  false;
  }  
  
  /**
   * generates the HTML for a single day
   * @param  {[type]} day    [description]
   * @param  {[type]} events [description]
   * @return {[type]}        [description]
   */
  getDayHtml(day, events) {
    const className = moment().format('DD') === moment(day).format('DD') ? 'date now' : 'date';
    let momentDay = moment(day);

    return `
        <div class="calendar-day">
          <div class="${className}">
			${this.config.showMonth ? `<div>${momentDay.format('MMM')}</div>` : ''}
            <div>${momentDay.format('DD')}</div>
            <div>${momentDay.format('ddd')}</div>
          </div>
          <div class="events">
            ${events.map(event => this.getEventHtml(event)).join('')}
          </div>
        </div>`;
  }

  /**
   * generate HTML for a single event
   * @param  {[type]} event [description]
   * @return {[type]}       [description]
   */
  getEventHtml(event) {
    //show standard progress bar
	if(event.type) {
		return `<ha-icon icon="mdi:circle" class="now"></ha-icon><hr class="now" />`;
    }

	// show current progress bar if event is running
	let progress=''
	let start = moment(event.startDateTime);
	let end = moment(event.endDateTime);
	let now = moment();
	if (this.config.showCurrentProgress && this.config.showProgressBar && moment().format('DD') === moment(event.startDateTime).format('DD') && !event.isFullDayEvent) {
		if(now>=start && now<=end){
			let eventDuration = end.diff(start, 'minutes');
			let eventProgress = now.diff(start, 'minutes');
			let eventPercentProgress= Math.floor((eventProgress * 100)/eventDuration);
			progress=`<ha-icon icon="mdi:circle" class="current" 	style="margin-left:${eventPercentProgress}%;"></ha-icon><hr class="now" />`;
		}
	}

	// setting text color, if todayColor or tomorrowColor is set in config
	let todayClass;
	if (this.isEventToday(event) && this.config.todayColor!='')
		todayClass = `<div class="time" style="color: ${this.config.todayColor}">`
	else if (this.isEventTomorrow(event) && this.config.tomorrowColor!='')
		todayClass = `<div class="time" style="color: ${this.config.tomorrowColor}">`
	else
		todayClass = `<div class="time">`
	
    return `
          <div class="event-wrapper">
            <div class="event" >
              <div class="info">
                <div class="summary" ${this.getLinkHtml(event)}>
                  ${this.getTitleHtml(event)} 
                </div>
                ${this.getLocationHtml(event)} 
              </div>
              ${todayClass}${this.getTodayHtml(event)}${this.getTimeHtml(event)}</div>
            </div>
          </div>
			${progress}`;
  }

  /**
   * gets the ebent title with a colored marker if user wants
   * @return {[type]} [description]
   */
  getTitleHtml(event){
	let showDot = this.config.showDot ? `&#9679;&nbsp;` : ``  
    return this.config.showColors ? `<span style="color: ${event.color || ''};">${showDot}${event.title}</span>` : `${event.title}`;
  }

  /**
   * generates HTML for opening an event
   * @param {*} event 
   */
  getLinkHtml(event){
    return event.htmlLink ? `onClick="(function(){window.open('${event.htmlLink}');return false;})();return false;"` : '';
  }

  /**
   * generates HTML for showing an event times
   * @param {*} event 
   */
  getTimeHtml(event){
    if (event.isFullDayEvent) return this.config.textAllDay

    const start = moment(event.startDateTime).format(this.config.timeFormat);
    const end = moment(event.endDateTime).format(this.config.timeFormat);
    return `${start} - ${end}`;
  }

  /**
   * generates HTML for showing if event is today or tomorrow
   * @param {*} event 
   */
  getTodayHtml(event){
	if(this.config.showTodayText){
		if(this.isEventToday(event)) return `${this.config.textToday}&nbsp`;
		else if(this.isEventTomorrow(event)) return `${this.config.textTomorrow}&nbsp`;
		else return ''
	} else return ''
	
  }
  
  /**
   * generate the html for showing an event location
   * @param {*} event 
   */
  getLocationHtml(event){
    let locationHtml = ``;

    if (event.location) {
      locationHtml += `
        <div class="location">
          <ha-icon icon="mdi:map-marker"></ha-icon>&nbsp;`
    }

    if (event.location && event.locationAddress) {
		let linkStyle=''
		this.config.linkColor!='' ? linkStyle=` color: ${this.config.linkColor} ` : ''
		locationHtml += `
          <a href="https://maps.google.com/?q=${event.locationAddress}" target="_blank" style="${linkStyle}; font-size: ${this.config.textSizeLocation}%"> 
            ${event.location}
          </a>
        </div>`;

    } else if (event.location) {
      locationHtml += `</div>`
    }

    return locationHtml;
  }

  /**
   * merge the user configuration with default configuration
   * @param {[type]} config [description]
   */
  setConfig(config) {
    if (!config.entities) {
      throw new Error('You need to define at least one calendar entity via entities');
    }

    this.config = {
      title: 'Calendar',
      showProgressBar: true,
      numberOfDays: 7,
      showColors: false,
      timeFormat: 'HH:mm',
	  textAllDay: 'All day',
	  textToday: '',
	  textTomorrow: '',
	  showTodayText: true,
	  showDot: true,
	  showCurrentProgress: false,
	  textSizeSummary: '100',
	  textSizeTime: '90',
	  textSizeLocation: '90',
	  linkColor: '',
	  mapIconColor: 'var(--paper-item-icon-color, #44739e)',
	  showMonth: false,
      ...config
    };
	
	if (typeof this.config.entities === 'string')
      this.config.entities = [{entity: config.entities}];
    this.config.entities.forEach((entity, i) => {
      if (typeof entity === 'string')
        this.config.entities[i] = { entity: entity };
	});
	
  }

  /**
   * get the size of the card
   * @return {[type]} [description]
   */
  getCardSize() {
    return 3;
  }

  /**
   * did any event change since the last time we checked?
   * @param  {[type]}  events [description]
   * @return {Boolean}        [description]
   */
  isSomethingChanged(events) {
    let isSomethingChanged = JSON.stringify(events) !== JSON.stringify(this.events);
    return isSomethingChanged;
  }

  /**
   * ddep clone a js object
   * @param  {[type]} obj [description]
   * @return {[type]}     [description]
   */
  deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  /**
   * group evbents by a givenkey
   * @param  {[type]} list      [description]
   * @param  {[type]} keyGetter [description]
   * @return {[type]}           [description]
   */
  groupBy(list, keyGetter) {
    const map = new Map();

    list.forEach(item => {
        const key = keyGetter(item);
        const collection = map.get(key);

        if (!collection) {
            map.set(key, [item]);
        } else {
            collection.push(item);
        }
    });

    return map;
  }
}

/**
 * Creaates an generalized Calendar Event to use when creating the calendar card
 * There can be Google Events and CalDav Events. This class normalizes those
 */
class CalendarEvent {
  
  /**
   * [constructor description]
   * @param  {[type]} calendarEvent [description]
   * @return {[type]} [description]
   */
  constructor(calendarEvent,color) {
    this.calendarEvent = calendarEvent;
	this.color = color;
  }

  /**
   * get the start time for an event
   * @return {[type]} [description]
   */
  get startDateTime() {
    if (this.calendarEvent.start.date) {
      let dateTime = moment(this.calendarEvent.start.date);
      return dateTime.toISOString();
    }

    return this.calendarEvent.start && this.calendarEvent.start.dateTime || this.calendarEvent.start || '';
  }

  /**
   * get the end time for an event
   * @return {[type]} [description]
   */
  get endDateTime() {
    return this.calendarEvent.end && this.calendarEvent.end.dateTime || this.calendarEvent.end || '';
  }

  /**
   * get the URL for an event
   * @return {[type]} [description]
   */
  get htmlLink(){
    return this.calendarEvent.htmlLink;
  }

 
  /**
   * get the title for an event
   * @return {[type]} [description]
   */
  get title() {
    return this.calendarEvent.summary || this.calendarEvent.title;
  }

  /**
   * get the description for an event
   * @return {[type]} [description]
   */
  get description() {
    return this.calendarEvent.description;
  }

  /**
   * parse location for an event
   * @return {[type]} [description]
   */
  get location() {
    if(this.calendarEvent.location) {
      return this.calendarEvent.location.split(',')[0]
    }

    return undefined;
  }

  /**
   * get location address for an event
   * @return {[type]} [description]
   */
  get locationAddress() {
    if(this.calendarEvent.location) {
      //let address = this.calendarEvent.location.substring(this.calendarEvent.location.indexOf(',') + 1); 
	  let address = this.calendarEvent.location;
      return address.split(' ').join('+');
    }
    return undefined;
  }

  /**
   * is the event a full day event?
   * @return {Boolean} [description]
   */
  get isFullDayEvent() {
    if (this.calendarEvent.start && this.calendarEvent.start.date){
      return this.calendarEvent.start.date;
    }

    let start = moment(this.startDateTime);
    let end = moment(this.endDateTime);
    let diffInHours = end.diff(start, 'hours');
    return diffInHours >= 24;
  }
 
  get color() {
    return this._color;
  }
  set color(color) {
    this._color = color;
}  
  
}

/**
 * add card definition to hass
 */
customElements.define('calendar-card', CalendarCard);