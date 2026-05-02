import "dotenv/config"
// imports configured express app
import app from './app';


const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});