const Chat = require('./chat')
const { v4: uuidv4 } = require('uuid');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));

class Client {
    #token = undefined;
    #isGuest = false;
    #authenticated = false;
    #guestHeaders = {
        'Content-Type': 'application/json'
    }

    constructor() {
        this.#token = undefined;
    }

    // api fetching
    async fetchCategories() {
        const request = await fetch('https://beta.character.ai/chat/character/categories/')

        if (request.status === 200) return await request.json();
        else throw Error('Failed to fetch categories');
    }
    async fetchUserConfig() {
        const request = await fetch('https://beta.character.ai/chat/config/', {
            headers:this.#guestHeaders
        })
        
        if (request.status === 200) {
            const response = await request.json()

            return response;
        } else Error('Failed fetching user configuration.')
    }
    async fetchUser() {
        if (!this.isAuthenticated()) throw Error('You must be authenticated to do this.');
        
        const request = await fetch('https://beta.character.ai/chat/user/', {
            headers:this.getHeaders()
        })

        if (request.status === 200) {
            const response = await request.json()

            return response;
        } else Error('Failed fetching user.')
    }
    async fetchFeaturedCharacters() {
        if (!this.isAuthenticated()) throw Error('You must be authenticated to do this.');
        
        const request = await fetch('https://beta.character.ai/chat/characters/featured_v2/', {
            headers:this.getHeaders()
        })

        if (request.status === 200) {
            const response = await request.json()

            return response;
        } else Error('Failed fetching featured characters.')
    }
    async fetchCharactersByCategory(curated = false) {
        if (curated == undefined || typeof(curated) != 'boolean') throw Error('Invalid arguments.')

        const url = `https://beta.character.ai/chat/${
            curated ? 'curated_categories' : 'categories'
        }/characters/`;

        const request = await fetch(url, {
            headers:this.#guestHeaders
        })

        const property = curated
        ? 'characters_by_curated_category'
        : 'characters_by_category';
      
        if (request.status === 200) {
            const response = await request.json()

            return response[property]
        } else Error('Failed fetching characters by category.')
    }
    async fetchCharacterInfo(characterId) {
        if (!this.isAuthenticated()) throw Error('You must be authenticated to do this.');
        if (characterId == undefined || typeof(characterId) != 'string') throw Error('Invalid arguments.')

        const request = await fetch(`https://beta.character.ai/chat/character/info-cached/${characterId}/`, {
            headers:this.getHeaders()
        })

        if (request.status === 200) {
            const response = await request.json()

            return response.character;
        } else Error('Could not fetch character information.')
    }
    async searchCharacters(characterName) {
        if (!this.isAuthenticated()) throw Error('You must be authenticated to do this.');
        if (this.#isGuest) throw Error('Guest accounts cannot use the search feature.');
        if (characterName == undefined || typeof(characterName) != 'string') throw Error('Invalid arguments.')

        const request = await fetch(`https://beta.character.ai/chat/characters/search/?query=${characterName}`, {
            headers:this.getHeaders()
        })
        
        if (request.status === 200) {
            const response = await request.json()

            return response;
        } else Error('Could not search for characters.')
    }
    async getRecentConversations() {
        if (!this.isAuthenticated()) throw Error('You must be authenticated to do this.');
        const request = await fetch(`https://beta.character.ai/chat/characters/recent/`, {
            headers:this.getHeaders()
        })

        if (request.status === 200) {
            const response = await request.json()

            return response;
        } else Error('Could not get recent conversations.')
    }

    // chat
    async createOrContinueChat(characterId, externalId = null) {
        if (!this.isAuthenticated()) throw Error('You must be authenticated to do this.');
        if (characterId == undefined || typeof(characterId) != 'string' || typeof(externalId != null ? externalId : '') != 'string') throw Error('Invalid arguments.')

        let request = await fetch('https://beta.character.ai/chat/history/continue/',  {
            body:JSON.stringify({
                character_external_id: characterId,
                history_external_id: externalId,
            }),
            method:'POST',
            headers:this.getHeaders()
        })

        if (request.status === 200 || request.status === 404) {
            let response = await request.text()
            
            if (response === "No Such History" || response === "there is no history between user and character") { // Create a new chat
                request = await fetch('https://beta.character.ai/chat/history/create/', {
                    body:JSON.stringify({
                        character_external_id: characterId,
                        history_external_id: null,
                    }),
                    method:'POST',
                    headers:this.getHeaders()
                })
                if (request.status === 200) response = await request.json()
                else Error('Could not create a new chat.')
            } 

            // If a text gets returned, we try to parse it to JSON!
            try {
                response = JSON.parse(response);
            } catch (error) {}

            // Continue it 
            const continueBody = response;
            return new Chat(this, characterId, continueBody)
        } else Error('Could not create or resume a chat.')
    }

    // authentification
    async authenticateWithToken(token) {
        if (this.isAuthenticated()) throw Error('Already authenticated');
        if (!token || typeof(token) != 'string') throw Error('Specify a valid token');

        const request = await fetch('https://beta.character.ai/dj-rest-auth/auth0/', {
            method:'POST',
            body:JSON.stringify({
                access_token: token
            }),
            headers:{
                'Content-Type': 'application/json',
            }
        })

        if (request.status === 200) {
            const response = await request.json()

            this.#isGuest = false;
            this.#authenticated = true;
            this.#token = response.key;

            return response.token
        } else throw Error('Token is invalid')
    }
    async authenticateAsGuest() {
        if (this.isAuthenticated()) throw Error('Already authenticated');
        const uuid = uuidv4();
        
        const request = await fetch('https://beta.character.ai/chat/auth/lazy/', {
            method:'POST',
            body:JSON.stringify({
                lazy_uuid: uuid
            }),
            headers: this.#guestHeaders
        })

        if (request.status === 200) {
            const response = await request.json()
            
            if (response.success === true) {
                this.#isGuest = true;
                this.#authenticated = true;
                this.#token = response.token;

                return response.token;
            } else throw Error('Registering failed');
        } else throw Error('Failed to fetch a lazy token')
    }
    unauthenticate() {
        if (this.isAuthenticated()) {
            this.#authenticated = false;
            this.#isGuest = false;
            this.#token = undefined;
        }
    }

    // getters
    getToken() {
        return this.#token;
    }
	setToken(token) {
		this.#token = token;
    }
    isGuest() {
        return this.#isGuest;
    }
	setGuest(a) {
		this.#isGuest = a;
    }
    isAuthenticated() {
        return (this.#authenticated)
    }
	setAuthenticated(a) {
		this.#authenticated = a;
    }
    // headers
    getHeaders() {
        return {
            authorization: `Token ${this.#token}`,
            'Content-Type': 'application/json',
            //'sec-ch-ua': `"Not_A Brand";v="99", "Google Chrome";v="109", "Chromium";v="109"`,
            //'sec-ch-ua-mobile': '?0'
            /*'sec-ch-ua-platform': "Windows",
            'sec-fetch-dest': 'empty',
            'sec-fetch-mode': 'cors',
            'sec-fetch-site': 'same-origin',*/
            //'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36'
        };
    }
}

module.exports = Client