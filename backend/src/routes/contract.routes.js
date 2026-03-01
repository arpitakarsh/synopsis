const express      = require('express')
const router       = express.Router()
const { authenticate } = require('../middleware/auth')
const {
  getPresignedUrl,
  createContract,
  listContracts,
  getContract,
  deleteContract,
} = require('../controllers/contract.controller')

router.get('/presign',  authenticate, getPresignedUrl)
router.post('/', authenticate, createContract)
router.get('/',  authenticate, listContracts)
router.get('/:id', authenticate, getContract)
router.delete('/:id',authenticate, deleteContract)

module.exports = router